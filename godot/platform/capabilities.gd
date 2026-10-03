extends RefCounted

# This native local build has no integrated WeChat or reward platform SDK.
static func describe() -> Dictionary:
	return {"localIdentity": true, "rewardSimulation": true, "wx": false,
		"cloud": false, "friends": false, "ads": false, "share": false, "vibration": false}
