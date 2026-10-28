#!/bin/bash
KEY="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCrf7WRAiL6mbl202pGDwl9vJBz9VVdxUsNWVu2SX8yZxmLy6AjuCB4BvObhFSp82FRBGJxwE+8HnrDGn6rSUG07cW7GBPiDnW8aJGUUHqe1L6+rAuhc9qOn5tpm6I0iQc5Yr9JlL1UHX+7HLoupo/t6aKAYrDUDKgREH9olRMQlYRNm7lLp9QAG4YYXynSi19NLhcU+H3dJz2dgG2NuIQ5CiRjtVqCamMqvCdO6jUNWND1/dfzTPgDPfYj2FvMOsj5QcYWyTmZC8DemiXmxuOM2L/nvWH7Kj7+3Y+wiUtSVtyLZXzOotMqxBMnctH0D/NSYm2k5+vsWwPysG5Td2db developer-laptop"
grep -qF "$KEY" ~/.ssh/authorized_keys 2>/dev/null || echo "$KEY" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "DEV_KEY_INSTALLED"
