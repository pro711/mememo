# -*- coding: utf-8 -*-
from django.conf.urls.defaults import *

urlpatterns = patterns('apps.xnmemo.views',
    #~ (r'^$', 'xnmemo_index'),
    (r'^get_items/$', 'get_items'),
    (r'^update_item/$', 'update_item'),
    (r'^mark_items/$', 'mark_items'),
    (r'^get_stats/$', 'get_stats'),
    (r'^update_learning_progress/$', 'update_learning_progress'),
    #~ (r'^(?P<lesson_id>\d+)/$', 'lesson_detail'),
)
