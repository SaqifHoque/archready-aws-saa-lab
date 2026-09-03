import json
import os
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])


def response(status, body=None):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": "" if body is None else json.dumps(body, separators=(",", ":")),
    }


def user_id(event):
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    return claims.get("sub")


def query_records(uid, projection=None):
    kwargs = {"KeyConditionExpression": Key("userId").eq(uid)}
    if projection:
        kwargs["ProjectionExpression"] = projection
    items = []
    while True:
        result = table.query(**kwargs)
        items.extend(result.get("Items", []))
        if "LastEvaluatedKey" not in result:
            return items
        kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]


def get_progress(uid):
    records = query_records(uid)
    profile = next((item for item in records if item["recordKey"] == "PROFILE"), None)
    if not profile:
        return response(200, {"progress": None})
    progress = json.loads(profile["data"])
    attempts = [json.loads(item["data"]) for item in records if item["recordKey"].startswith("ATTEMPT#")]
    attempts.sort(key=lambda item: item.get("completedAt", 0), reverse=True)
    progress["attempts"] = attempts[:60]
    return response(200, {"progress": progress})


def put_progress(uid, event):
    try:
        payload = json.loads(event.get("body") or "{}")
        progress = payload["progress"]
        attempts = progress.pop("attempts", [])[:60]
        profile_data = json.dumps(progress, separators=(",", ":"))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return response(400, {"message": "A valid progress object is required."})
    if len(profile_data.encode("utf-8")) > 350_000:
        return response(413, {"message": "The progress profile is too large."})

    table.put_item(Item={"userId": uid, "recordKey": "PROFILE", "data": profile_data})
    retained_keys = set()
    with table.batch_writer() as batch:
        for attempt in attempts:
            attempt_id = str(attempt.get("id") or attempt.get("completedAt") or "")
            if not attempt_id:
                continue
            record_key = f"ATTEMPT#{attempt_id}"
            retained_keys.add(record_key)
            batch.put_item(Item={"userId": uid, "recordKey": record_key, "data": json.dumps(attempt, separators=(",", ":"))})
        existing = query_records(uid, "userId, recordKey")
        for item in existing:
            key = item["recordKey"]
            if key.startswith("ATTEMPT#") and key not in retained_keys:
                batch.delete_item(Key={"userId": uid, "recordKey": key})
    return response(200, {"saved": True})


def delete_progress(uid):
    records = query_records(uid, "userId, recordKey")
    with table.batch_writer() as batch:
        for item in records:
            batch.delete_item(Key={"userId": uid, "recordKey": item["recordKey"]})
    return response(204)


def handler(event, _context):
    uid = user_id(event)
    if not uid:
        return response(401, {"message": "Unauthorized"})
    method = event.get("requestContext", {}).get("http", {}).get("method")
    if method == "GET":
        return get_progress(uid)
    if method == "PUT":
        return put_progress(uid, event)
    if method == "DELETE":
        return delete_progress(uid)
    return response(405, {"message": "Method not allowed"})
