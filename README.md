# Starting PM2 process

To launch the monitoring service, run:

pm2 start mb-monitor --cron `* * * * *` --no-autorestart --instances 1

Where mb-monitor is the id of the service.

# Stopping process

To stop the monitoring service, we first prevent --cron from restarting the process and then stop it.

pm2 restart mb-monitor --cron-restart 0

pm2 stop mb-monitor
