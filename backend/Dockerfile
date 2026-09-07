FROM node:20-slim

# Install system dependencies: FFmpeg, Python 3, yt-dlp, and SSL certificates
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install exact node dependencies
COPY package*.json ./
RUN npm ci

# Copy backend source code
COPY . .

EXPOSE 5000

# Start production server
CMD ["node", "app.js"]