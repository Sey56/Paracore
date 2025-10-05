# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Set environment variables for Python behavior
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install uv, the fast package installer
RUN pip install uv

# Copy the requirements file and install dependencies
COPY server/requirements.txt .
RUN uv pip install --system --no-cache-dir -r requirements.txt

# Copy your application code into the container
COPY server/ ./server/

# ✅ Copy the .env file into the container root
COPY .env .env

# Expose the port your app will run on
EXPOSE 8001

# Run your FastAPI app using uvicorn
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8001"]