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
  buildName = getBuildName(build)
  let message = {
   text: `*${buildName}* \`${build.id}\``,
    mrkdwn: true,
    attachments: [
      {
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
  name = (BuildNameKey in build.substitutions)  ? build.substitutions[BuildNameKey] : "NO BUILD TRIGGER NAME (misssing substitution for _BUILD_NAME)"
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

    // Build steps
    build.steps.forEach( (step, i) => {
      
      fields.push({
        title: `Step ${i+1}`,
        value: step.args.join(" ")
      })

      elapsed = Date.parse(step.timing.endTime) - Date.parse(step.timing.startTime)
      fields.push({
        title: "Elapsed Step Time",
        value: `${(elapsed / 1000.0).toFixed(2)} seconds`
      })
    })

    // Buildstep outputs:
    build.results.buildStepOutputs.forEach( (out_str) => {
      fields.push({
        title: "Output",
        value: out_str
      })
    })

    // Time
    elapsed = Date.parse(build.finishTime) - Date.parse(build.startTime)
    fields.push({
      title: "Elapsed total build time",
      value: `${(elapsed / 1000.0).toFixed(2)} seconds`
    })

    fields.push({
      title: "Start Time",
      value: build.startTime
    })

    fields.push({
      title: "End Time",
      value: build.finishTime
    })



  }
  return fields
}