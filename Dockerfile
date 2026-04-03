FROM heroiclabs/nakama:3.22.0

COPY data /nakama/data

ENTRYPOINT ["/bin/sh", "-ecx"]
CMD ["/nakama/nakama migrate up --database.address \"$DATABASE_URL\" && exec /nakama/nakama --database.address \"$DATABASE_URL\" --logger.level info --socket.server_key \"defaultkey\" --runtime.path \"/nakama/data/modules\""]
