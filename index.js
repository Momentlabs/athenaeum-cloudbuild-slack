const IncomingWebhook = require('@slack/client').IncomingWebhook;
const SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/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"

const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL);

// subscribe is the main function called by Cloud Functions.
module.exports.subscribe = (event, callback) => {
 const build = eventToBuild(event.data.data);

// Skip if the current status is not in the status list.
// Add additional statues to list if you'd like:
// QUEUED, WORKING, SUCCESS, FAILURE,
// INTERNAL_ERROR, TIMEOUT, CANCELLED
  const status = ['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT'];
  if (status.indexOf(build.status) === -1) {
    return callback();
  }

  // Send message to Slack.
  const message = createSlackMessage(build);
  webhook.send(message, callback);
};

// eventToBuild transforms pubsub event message to a build object.
const eventToBuild = (data) => {
  return JSON.parse(new Buffer(data, 'base64').toString());
}

// createSlackMessage create a message from a build object.
const createSlackMessage = (build) => {
  color =  (build.status !== "SUCCESS") ? "danger" : "good"

  buildName = getBuildName(build)
  let message = {
   text: `*${buildName}* \`${build.id}\``,
    mrkdwn: true,
    attachments: [
      {
        color: color,
        title: 'Build logs',
        title_link: build.logUrl,
        fields: messageFields(build)
      }
    ]
  };
  return message
}

// We define this in our build triggers to identify the trigger
const BuildNameKey = "_BUILD_NAME" 
const getBuildName = (build) => {
  // Build Name
  name = (BuildNameKey in build.substitutions)  ? build.substitutions[BuildNameKey] : "NO BUILD  NAME (misssing substitution for _BUILD_NAME)"
  return name
}

const messageFields = (build) => {

  fields = []
  // Status
  fields.push({
    title: "Status",
    value: build.status
  })

  // Repo Stats
  if ("resolvedRepoSource" in build.sourceProvenance) {
    repoSource = build.sourceProvenance["resolvedRepoSource"]

    fields.push({
      title: "Git Repo",
      value: repoSource.repoName
    })

    if ("_HELM_REPO_BUCKET" in build.substitutions) {
      fields.push({
        title: "Hem Repository Bucket",
        value: build.substitutions["_HELM_REPO_BUCKET"]
      })
    }

    if ("branchName" in  repoSource) {
      fields.push({
        title: "Branch",
        value: repoSource.branchName
      })
    } else if ( "BRANCH_NAME" in build.substitutions) {
      fields.push({
        title: "Branch",
        value: builds.substitutions["BRANCH_NAME"]
      })
    }

    if("tagName" in repoSource) {
      fields.push({
        title: "Tag",
        value: repoSource.tagName
      })
    }

    if("commitSha" in repoSource ){
      fields.push({
        title: "SHA",
        value: repoSource.commitSha
      })
    }
  }

  // Images Built
  if("images" in build) {
    fields.push({
      title: "Built Docker Images",
      value: imagesString(build.results.images)
    })
  }

  // Build steps
  fields.push({
    title: "Build Steps",
    value: buildStepsString(build.steps)
  })

  // Buildstep outputs:
  build.results.buildStepOutputs.forEach( (out_str) => {
    fields.push({
      title: "Output",
      value: out_str
    })
  })

  // Times
  fields.push({
    title: "Build time",
    value: buildTimeString(build)
  })

  // build.timming.keys( (key) => {
  //   value = build.timing[key]
  //   fields.push({
  //     title: `${key}`,
  //     value: `${elapsedTime(value.startTime, value.EndTime)}`
  //   })
  // })

  return fields

}

const buildTimeString = (build) => {
  strs = []
  strs.push(`Elapsed Time: ${elapsedTime(build.startTime, build.finishTime)} seconds`)
  strs.push(slackDateString(build.startTime, "Start: {date_long_pretty} at {time_secs}"))
  strs.push(slackDateString(build.finishTime, "Finish: {date_long_pretty} at {time_secs}"))
  return strs.join("\n")
}

const elapsedTime = (d1, d2) => {
  return ((Date.parse(d2) - Date.parse(d1)) / 1000.0).toFixed(2)
}

const elapsedTimeSpan = (ts) => {
  return elapsedTime(ts.startTime, ts.endTime)
}

// e: Unix epcoh timestampe
// s: string with Slack formatting for how to print the date: e.g. "date_long"
// https://api.slack.com/docs/message-formatting
const slackDateString = (e, s) => {
  e_seconds = (Date.parse(e) / 1000.0).toFixed(0)
  // return "<!date^1392734382^Posted {date_num} {time_secs}|Posted 2014-02-18 6:39:42 AM>"
  return `<!date^${e_seconds}^${s}|${e}>`
}

const imagesString= (images) => {
  strs = []
  images.forEach( (image) => {
    strs.push(`${image.name} \`${image.digest}\``)
    strs.push(`Push time: ${elapsedTimeSpan(image.pushTiming)} seconds`)
  })
  return strs.join("\n")
}

const buildStepsString = (buildSteps) => {
  strs = []
  buildSteps.forEach( (step, i) => {
    strs.push(`*step ${i+1}* ${step.name}`)
    strs.push(`args: ${step.args.join(" ")}`)
    strs.push(`${elapsedTimeSpan(step.timing)} seconds`)
  })
  return strs.join("\n")
}