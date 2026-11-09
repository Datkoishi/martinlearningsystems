FROM mysql:8.4

COPY *.sh /ops/backup/
RUN chmod 0555 /ops/backup/*.sh

ENTRYPOINT ["/ops/backup/backup-loop.sh"]
