# OpenBirding API

This API provides endpoints for managing birding hotspots and syncing with eBird data.

## Endpoints

### GET /api/hotspots

Retrieves all hotspots from the database.

### POST /api/hotspots

Creates a new hotspot.

**Body:**

```json
{
  "_id": "string",
  "name": "string",
  "lat": "number",
  "lng": "number",
  "country": "string",
  "state": "string",
  "county": "string",
  "species": "number"
}
```

### POST /api/sync-hotspots

Syncs hotspots with eBird data for a specific region.

**Authentication:**

- Header: `Authorization: Bearer <CRON_SECRET>`
- Query parameter: `key=<CRON_SECRET>`

**Query Parameters:**

- `region` (required): Specific region to sync (e.g., "US-CA", "US-NY")
- `key` (optional): Authentication key

**Response:**

```json
{
  "success": true,
  "message": "Synced US-CA. Found 5 new hotspots.",
  "region": "US-CA",
  "insertCount": 5,
  "updateCount": 10,
  "deleteCount": 2
}
```

### POST /api/sync-all-hotspots

Syncs hotspots with eBird data for regions that haven't been synced recently (default: 30 days). Only syncs regions that need updating, with a 5-second delay between each region.

**Authentication:**

- Header: `Authorization: Bearer <CRON_SECRET>`
- Query parameter: `key=<CRON_SECRET>`

**Response:**

```json
{
  "success": true,
  "message": "Completed sync of 15 regions. 15 successful, 0 failed. Total new hotspots: 375",
  "totalRegions": 15,
  "successfulSyncs": 15,
  "failedSyncs": 0,
  "totalInsertCount": 375,
  "results": [
    {
      "region": "US-CA",
      "success": true,
      "message": "Synced US-CA. Found 25 new hotspots.",
      "insertCount": 25
    }
  ]
}
```

## Environment Variables

- `MONGO_URI`: MongoDB connection string
- `EBIRD_API_KEY`: eBird API key for fetching hotspot data
- `CRON_SECRET`: Secret key for authenticating sync requests

## Sync Process

The sync endpoint:

1. Fetches hotspots from eBird API for the specified region
2. Compares with existing hotspots in the database
3. Updates existing hotspots if data has changed
4. Inserts new hotspots
5. Marks hotspots for deletion if they no longer exist in eBird
6. Logs the sync operation
7. Updates the sync timestamp for the region

## Sync Scheduling

- Regions are only synced if they haven't been synced within the last 30 days (configurable via `REGION_SYNC_INTERVAL`)
- The `sync-all-hotspots` endpoint only processes regions that need updating
- Individual region syncs can be forced by calling `sync-hotspots` with a specific region

## Usage Examples

### Manual sync for a specific region:

```bash
curl -X POST "https://your-api.vercel.app/api/sync-hotspots?region=US-CA&key=your-secret"
```

### Automated sync (cron job):

```bash
curl -X POST "https://your-api.vercel.app/api/sync-hotspots" \
  -H "Authorization: Bearer your-secret"
```

### Sync all regions:

```bash
curl -X POST "https://your-api.vercel.app/api/sync-all-hotspots" \
  -H "Authorization: Bearer your-secret"
```

## Data Models

### Hotspot

- `_id`: Unique identifier
- `name`: Hotspot name
- `lat`, `lng`: Coordinates
- `country`, `state`, `county`: Location information
- `species`: Number of species recorded
- `locationId`: eBird location ID
- `location`: GeoJSON Point for geospatial queries
- `needsDeleting`: Flag for soft deletion

### Settings

- `regionSyncTimestamps`: Map of region codes to Unix timestamps of last sync

### Log

- `user`: User performing the action
- `type`: Type of operation
- `message`: Description of the operation
