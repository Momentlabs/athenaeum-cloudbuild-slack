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



// Top level function for generating the Slack notification.
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


// Main Message: Basic build information and success for failure.
const makeMainMessage = (build) => {

  strs = []

  strs.push(`*${getBuildName(build)}*`)
  strs.push(`${getBuildDescription(build)}`)

  repo = getRepoName(build)
  if(repo) {
    strs.push(`Repo: ${repo}`)
  }

  branch = getBranchName(build)
  if(branch) {
    strs.push(`Branch: ${branch}`)
  }

  strs.push(`*${build.status}*`)
  if(checkValues(build.statusDetail)) {
    strs.push(`${build.statusDetail}`)
  }

  return strs.join("\n")
}

const messageFields = (build) => {

  fields = []

  fields.push({
    title: "Build ID",
    value: build.id
  })

  // Git Repo Stats: This usually only appears on a triggered build with a specific Git Repo on the trigger.
  if( checkValues(build.sourceProvenance, build.sourceProvenance.resolvedRepoSource)) {
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
  fields.push({
    title: "Built Docker Images",
    value: buildResultsImagesString(build)
  })

  // Build steps
  fields.push({
    title: "Build Steps",
    value: buildStepsString(build)
  })

  // Times
  fields.push({
    title: "Build time",
    value: buildTimeString(build)
  })

  return fields
}


//
// "Protected" Extraction from the build object.
//

// Depending on the the state of the build, we may or may not
// have values populated into the build object. We have to check.
// This will accept an argument list of possible values and return
// createSlackMessage create a message from a build object.
// False if any of them are undefined (so: true if they are all defined).
const checkValues = (...args) => {
  return args.reduce( (accum, val) => {
    return accum ? val !== undefined : accum
  }, true )
}


// To push some runtime variables into the build messages,
// we use step environment variables.
// It would be nice if this API was a little um more complete.
// TODO: A better mechanism is probably step output though that only works
// on succesfully completion.

// TODO: Use the environment not the substitution.
const BuildNameKey = "_BUILD_NAME" 
const getBuildName = (build) => {
  name = "NO BUILD  NAME (misssing substitution for _BUILD_NAME)"
  if( checkValues(build.substitutions, build.substitutions[BuildNameKey])) {
    name = build.substitutions[BuildNameKey]
  }
  return name
}

const DescriptionKey = "BUILD_DESCRIPTION"
const getBuildDescription = (build) => {
  bd = getLocalEnvVal(build, DescriptionKey)
  bd = (bd) ? "BUILD_DESCRIPTION not set in cloud build file" : bd
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


// We pass 'hard to get' information available at built time
// though the environment on the first build step.
// This will exctract the value for Key if it's there,
// otherwise return undefined
const getLocalEnvVal = (build, key) => {
  val = undefined
  if(checkValues(build.steps, build.steps[0], build.steps[0].env)) {
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

const buildResultsImagesStrings= (build, defaultString="No images built.") => {
  r = defaultString
  if(checkValues(build.results, build.results.images)) {
    strs = []
    images.forEach( (image) => {
      strs.push(`${image.name} \`${image.digest}\``)
      strs.push(`Push time: ${elapsedTimeSpan(image.pushTiming)} seconds`)
    })
    r = strs.join("\n")
  }
  return r
}

const buildStepsString = (build, defaultString="No build steps.") => {
  r = defaultString
  if(checkValues(build.steps)) {
    strs = []
    build.steps.forEach( (step, i) => {
      strs.push(`*step ${i+1}* ${step.name}`)
      strs.push(`args: ${step.args.join(" ")}`)
      if(checkValues(step.timing)) {
        strs.push(`execution time: ${elapsedTimeSpan(step.timing)} seconds`)
      }
    })
    r = strs.join("\n")
  } 
  return r
}

  // // Buildstep outputs
  // if( (build.results !== undefined) && (build.results.buildStepOutputs !== undefined)) {
  //   build.results.buildStepOutputs.forEach( (out_str) => {
  //     fields.push({
  //       title: "Output",
  //       value: out_str
  //     })
  //   })
  // }

const buildTimeString = (build) => {
  strs = []
  strs.push(`Elapsed Time: ${elapsedTime(build.startTime, build.finishTime)} seconds`)
  strs.push(slackDateString(build.startTime, "Start: {date_long_pretty} at {time_secs}"))
  strs.push(slackDateString(build.finishTime, "Finish: {date_long_pretty} at {time_secs}"))
  return strs.join("\n")
}

const elapsedTime = (d1, d2) => {
  return ((Date.parse(d2) - Date.parse(d1)) / 1000.0).toFixed(3)
}

const elapsedTimeSpan = (ts) => {
  return  checkValues( ts.startTime, ts.endTime) ? elapsedTime(ts.startTime, ts.endTime) : NaN
}

// dateTimeStr: Date/time string.
// formated: string with Slack formatting for how to print the date: e.g. "date_long"
// https://api.slack.com/docs/message-formatting
const slackDateString = (dateTimeStr, formattedMesg) => {
  e_seconds = (Date.parse(dateTimeStr) / 1000.0).toFixed(0)  // Unix epoch in seconds.
  return `<!date^${e_seconds}^${formatSTring}|${dateTimeStr}>`
}

