const { App, LogLevel } = require("@slack/bolt");
const { Octokit } = require("octokit");
const formatDistanceToNow = require("date-fns/formatDistanceToNow");
const format = require("date-fns/format");
const isBefore = require("date-fns/isBefore");
const dateSub = require("date-fns/sub");
require("dotenv").config();
const { handleLeaderboardCommand } = require("./handlers/leaderboard");

const OWNER = "cerbyinc";
const REPO = "platform";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  logLevel: LogLevel.DEBUG,
  socketMode: true,
  appToken: process.env.APP_TOKEN,
  port: process.env.PORT,
});

const octokit = new Octokit({ auth: process.env.GH_TOKEN });

const getPRAmountWarningMsg = (openPrs) => {
  if (!openPrs) {
    return "";
  }

  if (openPrs.length >= 50) {
    return ":alarm: :cop: There is an *alarming* amount of Pull Requests open. Please review some if you have the chance! :cop: :alarm:";
  } else if (openPrs.length >= 20 && openPrs.length < 50) {
    return ":warning: :cop: There is a *high* amount of Pull Requests open. Please review some if you have the chance! :cop: :warning:";
  } else if (openPrs.length >= 10 && openPrs.length < 20) {
    return ":warning: :cop: There is a *decent* amount of Pull Requests open. It's not too bad, but please review some if you have the chance! :cop: :warning:";
  } else {
    (":white_check_mark: :cop: There is a *healthy* amount of Pull Requests open. Great work, team! :cop: :white_check_mark:");
  }
};

// Listens to incoming messages that contain "hello"
app.message("hello", async ({ message, say }) => {
  // say() sends a message to the channel where the event was triggered
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Hey there xD <@${message.user}>!`,
        },
      },
    ],
    text: `Hey there <@${message.user}>!`,
  });
});

app.command("/list", async ({ command, ack, say }) => {
  try {
    // Acknowledge command request
    await ack();
    await say(":cop: Loading your PRs :loading:");
    const { data } = await octokit.rest.pulls.list({
      owner: "cerbyinc",
      repo: "platform",
      state: "open",
    });

    if (data.length <= 0) {
      await say("No open PRs! Nice! :cop:");
      return;
    }

    const resultBlocks = [];
    data.forEach((pr) => {
      resultBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: ` • ${pr.title} - *Created ${formatDistanceToNow(
            new Date(pr.created_at)
          )} ago.*`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Link",
            emoji: true,
          },
          value: `${pr.id}`,
          url: pr.html_url,
          action_id: `button-${pr.id}`,
        },
      });
    });

    await say({
      blocks: resultBlocks,
    });
  } catch (err) {
    console.error(err);
    await say("There was an unexpected error :(");
  }
});

app.command("/review-leaderboard", handleLeaderboardCommand);

app.command("/pr-summary", async ({ ack, say, client, payload }) => {
  try {
    // Acknowledge command request
    await ack();
    const {
      message: { ts: loadingMsgTs },
    } = await say({
      text: ":cop: Loading your PRs :loading:",
      user: payload.user_id,
      channel: payload.channel_id,
    });

    const { data: openData } = await octokit.rest.pulls.list({
      owner: OWNER,
      repo: REPO,
      state: "open",
      per_page: 100,
      sort: "created",
    });

    const { data: commitData } = await octokit.rest.repos.listCommits({
      owner: OWNER,
      repo: REPO,
      per_page: 100,
    });

    const { data: branchData } = await octokit.request(
      "GET /repos/{owner}/{repo}/branches/{branch}",
      {
        owner: OWNER,
        repo: REPO,
        branch: "main",
      }
    );

    if (loadingMsgTs) {
      await client.chat.update({
        ts: loadingMsgTs,
        channel: payload.channel_id,
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `:white_check_mark: Here's the info we got. :cool-squirtle:`,
              },
            ],
          },
        ],
      });
    }

    const resultBlocks = [
      {
        type: "divider",
      },
      {
        type: "header",
        text: {
          type: "plain_text",
          text: ":point_down::skin-tone-3: Here's your summary from the PR Police :cop:",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:1234: Number of *open PRs* is *${openData.length}*.`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "PRs Page in GH :old-man-yells-at-github:",
            emoji: true,
          },
          value: "pulls_link",
          url: `https://github.com/${OWNER}/${REPO}/pulls`,
          action_id: "button-pulls-link",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "image",
            image_url: branchData.commit.author.avatar_url,
            alt_text: "commit author",
          },
          {
            type: "mrkdwn",
            text: `${branchData.commit.author.login} was the author of the <${branchData.commit.html_url}|*last commit*> merged to *main*.`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: getPRAmountWarningMsg(openData),
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "image",
            image_url:
              "https://avatars.slack-edge.com/2021-10-08/2578569961110_4dae16c7d9403e184cdb_64.png",
            alt_text: "squirtle",
          },
          {
            type: "mrkdwn",
            text: "Squirtle approves this message.",
          },
        ],
      },
    ];

    await say({
      blocks: resultBlocks,
    });
  } catch (err) {
    console.error(err);
    await say(":x: There was an unexpected error. :cry:");
  }
});

app.command("/stale", async ({ command, ack, say }) => {
  try {
    await ack();

    if (isNaN(command.text)) {
      await say("Wrong format for days parameter. :cry:");
      return;
    }

    const dateToCompare = dateSub(Date.now(), { days: command.text });
    const formattedDateToCompare = format(dateToCompare, "MM/dd/yyyy");
    await say(
      `:cop: Loading your PRs from before *${formattedDateToCompare}* :loading:`
    );

    const { data } = await octokit.rest.pulls.list({
      owner: "cerbyinc",
      repo: "platform",
      state: "open",
    });

    const resultBlocks = data
      .filter((pr) => isBefore(new Date(pr.created_at), dateToCompare))
      .map((pr) => ({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:warning: ${pr.title} - *Created ${formatDistanceToNow(
            new Date(pr.created_at)
          )} ago.*`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Link",
            emoji: true,
          },
          value: `${pr.id}`,
          url: pr.html_url,
          action_id: `button-${pr.id}`,
        },
      }));

    await say({
      blocks: resultBlocks,
    });
  } catch (err) {
    console.error(err);
    await say("There was an unexpected error :(");
  }
});

(async () => {
  await app.start();

  console.log(`⚡️ Bolt app is running!`);
})();
