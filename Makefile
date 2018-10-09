BUCKET = gs://momentlabs-jupyter_cloudbuild/
TOPIC = cloud-builds

default: 
	gcloud beta functions deploy subscribe --stage-bucket ${BUCKET} --trigger-topic ${TOPIC}


