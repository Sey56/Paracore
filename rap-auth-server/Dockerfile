# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install uv, the fast package installer
RUN pip install uv

# Copy the requirements file
COPY server/requirements.txt .

# Install the Python dependencies using uv
RUN uv pip install --no-cache-dir -r requirements.txt

# Copy your application code into the container
COPY server/ ./server/

# Tell Docker that your app will listen on port 8001
EXPOSE 8001

# The command to run your app when the container starts
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8001"]
