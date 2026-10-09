#!/usr/bin/env bash
# One-time setup of the Android release signing key.
#
# Creates a keystore OUTSIDE the repository (default: ~/DollarBaan-signing) and stores it as
# GitHub Actions secrets so the release workflow can sign APKs. Every release must be signed
# with this same key, otherwise Android refuses to update an installed copy: back up the folder.
#
# Usage: bash scripts/android-signing.sh [directory]
# Needs: keytool (any JDK), openssl, and the GitHub CLI logged in to this repository.
set -euo pipefail

DIR=${1:-"$HOME/DollarBaan-signing"}
KEYSTORE="$DIR/dollarbaan-release.p12"
INFO="$DIR/README.txt"
ALIAS=dollarbaan

for tool in keytool openssl gh base64; do
    command -v "$tool" >/dev/null || { echo "Missing $tool"; exit 1; }
done
gh auth status >/dev/null

mkdir -p "$DIR"
chmod 700 "$DIR"

if [ -f "$KEYSTORE" ]; then
    echo "Using the existing keystore $KEYSTORE"
    PASSWORD=$(sed -n 's/^password: //p' "$INFO")
    [ -n "$PASSWORD" ] || { echo "Cannot read the password from $INFO"; exit 1; }
else
    PASSWORD=$(openssl rand -hex 24)
    keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -storepass "$PASSWORD" \
        -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
        -dname "CN=DollarBaan, O=MahdiGraph" -noprompt
    cat > "$INFO" <<EOF
DollarBaan Android release signing key - keep a backup of this folder in a safe place.
Losing it means existing installs can no longer be updated (users must uninstall first).

keystore: $(basename "$KEYSTORE")
alias: $ALIAS
password: $PASSWORD
EOF
    chmod 600 "$KEYSTORE" "$INFO"
    echo "Created $KEYSTORE"
fi

base64 < "$KEYSTORE" | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64
printf '%s' "$PASSWORD" | gh secret set ANDROID_KEYSTORE_PASSWORD
printf '%s' "$ALIAS" | gh secret set ANDROID_KEY_ALIAS

echo
echo "Done: the release workflow will sign APKs with this key."
echo "Back up $DIR (for example to an encrypted USB drive or a password manager)."
