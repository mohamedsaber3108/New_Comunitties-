#!/usr/bin/env bash
# Creates the CloudWatch log metric filters + alarms this platform needs.
# Run locally with AWS CLI configured for the target account/region (NOT on
# the EC2 host). Requires SNS_TOPIC_ARN (subscribe your on-call email/Slack
# webhook to it beforehand) and INSTANCE_ID.
#
#   SNS_TOPIC_ARN=arn:aws:sns:... INSTANCE_ID=i-0123... ./deploy/cloudwatch-alarms.sh
set -euo pipefail
: "${SNS_TOPIC_ARN:?}"
: "${INSTANCE_ID:?}"
REGION="${AWS_REGION:-eu-central-1}"
APP_LOG_GROUP=/usam-communities/app

put_filter() {
  aws logs put-metric-filter --region "$REGION" --log-group-name "$APP_LOG_GROUP" \
    --filter-name "$1" --filter-pattern "$2" \
    --metric-transformations metricName="$3",metricNamespace=UsamCommunities,metricValue=1,defaultValue=0
}
put_alarm() {
  aws cloudwatch put-metric-alarm --region "$REGION" --alarm-name "$1" \
    --namespace UsamCommunities --metric-name "$2" --statistic Sum \
    --period "${3:-300}" --evaluation-periods "${4:-1}" --threshold "${5:-1}" \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --treat-missing-data notBreaching --alarm-actions "$SNS_TOPIC_ARN"
}

put_filter usam-error-level  '{ $.level = "error" }'            UsamErrorLogs
put_filter usam-payment-flag '{ $.msg = "payments.amount_mismatch" }' UsamPaymentAmountMismatch
put_filter usam-webhook-bad  '{ $.msg = "payments.webhook_bad_hmac" }' UsamWebhookBadSignature
put_filter usam-health-fail  '{ $.msg = "health.failed" }'       UsamHealthFailed

put_alarm usam-error-rate       UsamErrorLogs 300 1 10   # >=10 error lines / 5 min
put_alarm usam-payment-mismatch UsamPaymentAmountMismatch 300 1 1   # any amount mismatch = page immediately
put_alarm usam-webhook-forgery  UsamWebhookBadSignature 300 1 5     # repeated bad signatures = possible attack
put_alarm usam-health-down      UsamHealthFailed 300 1 3

# Infrastructure-level alarms (instance + RDS; adjust the RDS identifier).
aws cloudwatch put-metric-alarm --region "$REGION" --alarm-name usam-cpu-high \
  --namespace AWS/EC2 --metric-name CPUUtilization --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
  --statistic Average --period 300 --evaluation-periods 3 --threshold 85 \
  --comparison-operator GreaterThanThreshold --alarm-actions "$SNS_TOPIC_ARN"

aws cloudwatch put-metric-alarm --region "$REGION" --alarm-name usam-disk-low \
  --namespace UsamCommunities --metric-name disk_used_percent --statistic Average \
  --period 300 --evaluation-periods 2 --threshold 85 \
  --comparison-operator GreaterThanThreshold --alarm-actions "$SNS_TOPIC_ARN"

echo "Alarms created. Remember to also set an RDS alarm on FreeStorageSpace / CPUUtilization"
echo "(aws cloudwatch put-metric-alarm --namespace AWS/RDS --dimensions Name=DBInstanceIdentifier,Value=<id> ...)."
