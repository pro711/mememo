# -*- coding: utf-8 -*-
from django.conf.urls.defaults import *

rootpatterns = patterns('',
    (r'^xnmemo/', include('apps.xnmemo.urls')),
)
