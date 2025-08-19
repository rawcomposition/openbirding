# OpenBirding API

A Hono-based API for the OpenBirding application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
MONGO_URI=your_mongodb_connection_string
EBIRD_API_KEY=your_ebird_api_key
CRON_SECRET=your_cron_secret_key
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
PORT=3001
```

3. Development:
```bash
npm run dev
```

4. Build and run production:
```bash
npm run build
npm start
```

## API Endpoints

- `GET /api/hotspots` - Get paginated list of hotspots
- `PUT /api/hotspots/:id` - Update a hotspot
- `GET /api/get-hotspot?locationId=<id>` - Get hotspot data from eBird and store in database
- `POST /api/sync-region?region=<region>` - Sync hotspots for a specific region
- `POST /api/sync-all-regions` - Sync all regions that need updating

## Architecture

- **Hono** - Web framework
- **MongoDB** - Database with Mongoose ODM
- **eBird API** - External data source for hotspot information
- **TypeScript** - Type safety and modern JavaScript features
