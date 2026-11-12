docker stop multirouter
docker rm multirouter
docker build -t multirouter .
docker run -d --name multirouter -p 20128:20128 --env-file .env -v multirouter-data:/app/data multirouter