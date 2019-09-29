#!/bin/sh

PID=`cat /srv/gsibot/bulldogGSI.pid`

if ! ps -p $PID > /dev/null
then
  rm /srv/gsibot/bulldogGSI.pid
  rm /srv/gsibot/bulldogLog.out
  sudo -u pajbot nohup node /srv/gsibot/integration.js $1 > /srv/gsibot/bulldogLog.out 2>&1 &
  echo $! > /srv/gsibot/bulldogGSI.pid
fi