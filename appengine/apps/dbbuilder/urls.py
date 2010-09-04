# -*- coding: utf-8 -*-
from django.conf.urls.defaults import *

urlpatterns = patterns('apps.dbbuilder.views',
    #~ (r'^$', 'xnmemo_index'),
    (r'^import/$', 'db_import'),
    (r'^remove_duplicates/$', 'remove_duplicates'),
    #~ (r'^(?P<lesson_id>\d+)/$', 'lesson_detail'),
    #~ (r'^all/$', 'lesson_all'),
)
