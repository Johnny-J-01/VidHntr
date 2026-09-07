FROM node:22-slim

# Install system dependencies (Python, ffmpeg, curl)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt-get/lists/*

# Download latest yt-dlp binary into system PATH
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set working directory inside container
WORKDIR /app

# Copy package files from context root
COPY package*.json ./
RUN npm install

# Copy all remaining backend files from context root
COPY . ./

# Expose port and start server
EXPOSE 5000
CMD ["npm", "start"]