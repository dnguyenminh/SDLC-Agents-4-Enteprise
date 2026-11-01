# Dockerfile for SA4E-387

# Use official Node.js 22 image
FROM node:22-alpine AS base

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 48721

# Start the application
CMD ["npm", "start"]

# Production target - optimized for production deployment
FROM base AS production

# No additional steps needed - base already has everything for production
# The base stage already has all production dependencies and built code