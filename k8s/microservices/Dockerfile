FROM python:3.12-slim

WORKDIR /app
RUN pip install flask==3.0.3 redis==5.0.4 --no-cache-dir

ARG SERVICE_FILE=service_a.py
ARG SERVICE_PORT=5000
ENV PORT=$SERVICE_PORT

COPY ${SERVICE_FILE} app.py
EXPOSE $SERVICE_PORT

CMD ["python", "app.py"]
