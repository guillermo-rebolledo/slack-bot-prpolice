const { Octokit } = require("octokit");

const octokit = new Octokit({ auth: process.env.GH_TOKEN });

const handleLeaderboardCommand = async ({
  command,
  ack,
  say,
  payload,
  client,
}) => {
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
    const { data } = await octokit.rest.pulls.list({
      owner: "cerbyinc",
      repo: "platform",
      state: "all",
      per_page: 100,
    });

    if (!data || data.length <= 0) {
      await say("No open PRs! Nice! :cop:");
      return;
    }

    const reviewPromises = data.map((pr) =>
      octokit.request(`GET /repos/cerbyinc/platform/pulls/${pr.number}/reviews`)
    );

    const reviewersWithCount = {};
    const reviewers = (await Promise.all(reviewPromises))
      .map(({ data }) => data.flat())
      .flat();

    reviewers.forEach((review) => {
      if (review.user.login in reviewersWithCount) {
        const reviewCount = reviewersWithCount[review.user.login];
        reviewersWithCount[review.user.login] = reviewCount + 1;
      } else {
        reviewersWithCount[review.user.login] = 1;
      }
    });

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
                text: `Here's the info we got. :cool-squirtle:`,
              },
            ],
          },
        ],
      });
    }

    const resultBlocks = [
      {
        type: "section",
        text: {
          type: "plain_text",
          emoji: true,
          text: " :cool-squirtle: :trophy:  From the last 100 pull requests, the top reviewers are:",
        },
      },
      {
        type: "divider",
      },
    ];

    const sortable = Object.entries(reviewersWithCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

    for (const [key, val] of Object.entries(sortable)) {
      resultBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:github-review: *${key}* with ${val} ${
            val > 1 ? `reviews` : `review`
          }.`,
        },
      });
    }

    await say({
      blocks: resultBlocks,
    });
  } catch (err) {
    console.error(err);
    await say("There was an unexpected error :(");
  }
};

module.exports = {
  handleLeaderboardCommand,
};
