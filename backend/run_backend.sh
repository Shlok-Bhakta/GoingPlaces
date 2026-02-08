#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}🚀 Starting Going Places Backend${NC}"

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
echo -e "${YELLOW}Activating virtual environment...${NC}"
source venv/bin/activate

# Install/upgrade dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install --upgrade pip -q
pip install -r requirements.txt -q

# Set environment variables
export CHAT_DB_PATH="${SCRIPT_DIR}/chat.db"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8000}"

echo -e "${GREEN}✓ Virtual environment ready${NC}"
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo -e "${BLUE}Starting FastAPI server with hot reload on ${HOST}:${PORT}${NC}"
echo ""

# Start the server with hot reload
uvicorn main:app --host "$HOST" --port "$PORT" --reload
