# -*- coding: utf-8 -*-
from django.db.models import permalink, signals
from django.utils.translation import ugettext_lazy as _
from django.utils.encoding import force_unicode,smart_str
from google.appengine.ext import db
from django.contrib.auth.models import User
import re
