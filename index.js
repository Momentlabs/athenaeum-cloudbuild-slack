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
  let message = {
   text: makeMainMessage(build),
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

const makeMainMessage = (build) => {
  buildName = getBuildName(build)
  description = getBuildDescription(build)
  strs = []
  strs.push(`*${buildName}*`)
  strs.push(`${description}`)

  repo = getRepoName(build)
  if(repo.indexOf("") !== -1) {
    strs.push(`Repo: ${repo}`)
  }

  branch = getBranchName(build)
  if(branch.indexOf("") !== -1) {
    strs.push(`Branch: ${branch}`)
  }

  strs.push(`*${build.status}*`)
  if("statusDetail" in build) {
    strs.push(`${build.statusDetail}`)
  }
  return strs.join("\n")
}

// We define this in our build triggers to identify the trigger
const BuildNameKey = "_BUILD_NAME" 
const getBuildName = (build) => {
  name = "NO BUILD  NAME (misssing substitution for _BUILD_NAME)"
  if( (build.substitutions !== undefined) && (BuildNameKey in build.substitutions) ) {
    name = build.substitutions[BuildNameKey]
  }
  return name
}

// To push some runtime variables into the build messages,
// we use step environment variables.
// It would be nice if this API was a little um more complete.
const DescriptionKey = "BUILD_DESCRIPTION"
const getBuildDescription = (build) => {
  bd = getLocalEnvVal(build, DescriptionKey)
  bd = (bd == "") ? "BUILD_DESCRIPTION not set in cloud build file" : bd
  return bd
}

const BranchNameKey = "BRANCH_NAME"
const getBranchName = (build) => {
  return getLocalEnvVal(build, BranchNameKey)
}

const RepoNameKey = "REPO_NAME"
const getRepoName = (build) => {
  return getLocalEnvVal(build, RepoNameKey)
}

const getLocalEnvVal = (build, key) => {
  val = ""
  if((build.steps !== undefined) && build.steps.length > 0 && (build.steps[0].env !== undefined)){
    for( item of build.steps[0].env ) {
      e = item.split("=")
      if(e[0].indexOf(key) !== -1) {
        val = e[1]
        break
      }
    }
  }
  return val
}

const messageFields = (build) => {

  fields = []

  fields.push({
    title: "Build ID",
    value: build.id
  })

  // Repo Stats
  if ( ( build.sourceProvenance !== undefined ) && ("resolvedRepoSource" in build.sourceProvenance) ) {
    repoSource = build.sourceProvenance["resolvedRepoSource"]

    fields.push({
      title: "Git Repo",
      value: repoSource.repoName,
      short: true
    })

    if ("branchName" in  repoSource) {
      fields.push({
        title: "Branch",
        value: repoSource.branchName,
        short: true
      })
    } 

    if("tagName" in repoSource) {
      fields.push({
        title: "Tag",
        value: repoSource.tagName,
        short: true
      })
    }

    if("commitSha" in repoSource ){
      fields.push({
        title: "SHA",
        value: repoSource.commitSha,
        short: true
      })
    }
  }

  // Images Built
  val = "No images built."
  if( (build.results !== undefined ) &&  ('images' in build.results)) {
    val = imagesString(build.results.images)
  }
  fields.push({
    title: "Built Docker Images",
    value: val
  })

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
  if( (ts.startTime === undefined) || (ts.endTime === undefined)) {
    return NaN
  }
  return elapsedTime(ts.startTime, ts.endTime)
}

// e: Unix epcoh timestampe
// s: string with Slack formatting for how to print the date: e.g. "date_long"
// https://api.slack.com/docs/message-formatting
const slackDateString = (e, s) => {
  e_seconds = (Date.parse(e) / 1000.0).toFixed(0)
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
    if(step.timing !== undefined) {
      strs.push(`execution time: ${elapsedTimeSpan(step.timing)} seconds`)
    }
  })
  return strs.join("\n")
}