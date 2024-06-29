# Use the current Long Term Support (LTS) version of Node.js
FROM node:lts

# Set the working directory
WORKDIR /app

# Copy the signalling server and frontend source code from the build context
COPY /Common /app/Common
COPY /Signalling /app/Signalling
COPY /SignallingWebServer /app/SignallingWebServer
COPY /Frontend /app/Frontend

# Install the dependencies for the signalling server and build the frontend
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Run the setup script to build the project
RUN chmod +x /app/SignallingWebServer/platform_scripts/bash/setup.sh
RUN /app/SignallingWebServer/platform_scripts/bash/setup.sh --build

# Expose the necessary ports
EXPOSE 80
EXPOSE 443
EXPOSE 8888
EXPOSE 8888/udp
EXPOSE 8889
EXPOSE 19302
EXPOSE 3478
EXPOSE 3479

# Set the signalling server as the container's entrypoint
ENTRYPOINT ["bash", "/app/SignallingWebServer/platform_scripts/bash/start.sh", "--nosudo"]
