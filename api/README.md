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

- `state` (optional): Specific region to sync (e.g., "US-CA", "US-NY")
- `key` (optional): Authentication key

**Response:**

```json
{
  "success": true,
  "message": "Successfully synced US-CA. Found 5 new hotspots.",
  "region": "US-CA",
  "insertCount": 5
}
```

### POST /api/sync-all-hotspots

Syncs hotspots with eBird data for all regions sequentially with a 5-second delay between each region.

**Authentication:**

- Header: `Authorization: Bearer <CRON_SECRET>`
- Query parameter: `key=<CRON_SECRET>`

**Response:**

```json
{
  "success": true,
  "message": "Completed sync of all regions. 50 successful, 0 failed. Total new hotspots: 1250",
  "totalRegions": 50,
  "successfulSyncs": 50,
  "failedSyncs": 0,
  "totalInsertCount": 1250,
  "results": [
    {
      "region": "US-CA",
      "success": true,
      "message": "Successfully synced US-CA. Found 25 new hotspots.",
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
7. Updates the last synced region

## Usage Examples

### Manual sync for a specific state:

```bash
curl -X POST "https://your-api.vercel.app/api/sync-hotspots?state=US-CA&key=your-secret"
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

- `lastSyncRegion`: Tracks the last region synced

### Log

- `user`: User performing the action
- `type`: Type of operation
- `message`: Description of the operation
