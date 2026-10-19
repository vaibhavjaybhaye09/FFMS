"""
WSGI config for config project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()







#for the server cloud 


# import os
# import sys

# # 1. Direct PythonAnywhere to your explicit codebase folder
# path = '/home/wolfvaibhav/pump/FFMS/backend'
# if path not in sys.path:
#     sys.path.insert(0, path)

# # 2. Tell Django where your main settings module lives
# # (Since your URLs are inside the 'config' folder, your module is 'config.settings')
# os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'

# from django.core.wsgi import get_wsgi_application
# application = get_wsgi_application()

