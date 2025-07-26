# OpenBirding

A modern bird watching application built with React, TypeScript, Vite, and Vercel serverless functions.

## Features

- 🐦 Browse bird species with detailed information
- 🎨 Modern UI built with ShadCN components
- ⚡ Fast development with Vite
- 🚀 Serverless API with Vercel
- 📱 Responsive design
- 🔄 Real-time data fetching with React Query

## Tech Stack

### Frontend

- **React 18** with TypeScript
- **Vite** for fast development and building
- **ShadCN UI** for beautiful components
- **Tailwind CSS** for styling
- **React Query** for data fetching
- **Lucide React** for icons

### Backend

- **Vercel Serverless Functions** with TypeScript
- **Node.js** runtime

## Project Structure

```
openbirding/
├── client/                 # Vite React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── ui/        # ShadCN UI components
│   │   │   └── ...
│   │   └── ...
│   └── ...
├── api/                   # Vercel serverless API
│   ├── api/              # API endpoints
│   └── ...
└── ...
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd openbirding
```

2. Install dependencies:

```bash
npm run install:all
```

### Development

Start both frontend and backend in development mode:

```bash
npm run dev
```

Or run them separately:

```bash
# Frontend only
npm run dev:client

# Backend only
npm run dev:api
```

The frontend will be available at `http://localhost:5173`
The API will be available at `http://localhost:3000/api`

### Building for Production

```bash
npm run build
```

## API Endpoints

- `GET /api/birds` - Get all bird species
- `POST /api/birds` - Add a new bird species
- `GET /api/hello` - Health check endpoint

## Deployment

### Frontend (Vercel)

The frontend can be deployed to Vercel by connecting your repository and setting the build directory to `client`.

### Backend (Vercel)

The API functions are automatically deployed to Vercel when you push to the main branch.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
