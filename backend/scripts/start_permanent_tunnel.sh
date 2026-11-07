#!/usr/bin/env bash
# ==============================================================================
# EduConnect Persistent Tunnel Daemon for Linux / Ubuntu Server
# Keeps SSH tunnel alive indefinitely, restarts on drop, updates pinggy URL,
# and pushes new URL to GitHub Gist registry automatically.
# ==============================================================================

PORT=${PORT:-5000}
HOME_DIR=${HOME:-/home/rasolserver}
URL_FILE="$HOME_DIR/current_pinggy_url.txt"
LOG_FILE="$HOME_DIR/pinggy.log"
GIST_ID="dc4b18cafa978e951913e8b4b832d817"
GIST_TOKEN="${GITHUB_TOKEN:-$GIST_TOKEN}"

echo "========================================================"
echo "  EduConnect Permanent Tunnel Watchdog Daemon Starting"
echo "  Target Port: localhost:$PORT"
echo "========================================================"

while true; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting persistent SSH tunnel..."
    
    # Run SSH Pinggy with TCP Keepalive and auto-exit flags
    ssh -o ServerAliveInterval=15 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes \
        -o StrictHostKeyChecking=no \
        -o TCPKeepAlive=yes \
        -p 443 \
        -R0:localhost:$PORT \
        a.pinggy.io 2>&1 | while read -r line; do
            echo "$line"
            # Check for Pinggy HTTPS URL
            if [[ "$line" =~ https://[a-zA-Z0-9.-]+\.(run\.pinggy-free\.link|free\.pinggy\.net|pinggy\.link) ]]; then
                NEW_URL="${BASH_REMATCH[0]}"
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found live URL: $NEW_URL"
                echo "$NEW_URL" > "$URL_FILE"
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] $NEW_URL" >> "$LOG_FILE"
                
                # Update Gist if Token is set
                if [ -n "$GIST_TOKEN" ]; then
                    echo "Updating GitHub Gist registry ($GIST_ID)..."
                    PAYLOAD="{\"files\":{\"tunnel.json\":{\"content\":\"{\\\"url\\\":\\\"$NEW_URL\\\",\\\"api_url\\\":\\\"$NEW_URL/api/v1\\\",\\\"updated_at\\\":\\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\\"}\"}}}"
                    curl -s -X PATCH "https://api.github.com/gists/$GIST_ID" \
                         -H "Authorization: Bearer $GIST_TOKEN" \
                         -H "User-Agent: EduConnect-Tunnel" \
                         -H "Content-Type: application/json" \
                         -d "$PAYLOAD" > /dev/null 2>&1
                    echo "GitHub Gist updated successfully!"
                fi
            fi
        done
        
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SSH tunnel connection dropped! Restarting in 3 seconds..."
    sleep 3
done

