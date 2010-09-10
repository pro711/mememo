# -*- coding: utf-8 -*-
from django.conf.urls.defaults import *

urlpatterns = patterns('apps.xnmemo.views',
    #~ (r'^$', 'xnmemo_index'),
    (r'^has_scheduled_items/$', 'has_scheduled_items'),
    (r'^get_items/$', 'get_items'),
    (r'^update_item/$', 'update_item'),
    (r'^skip_item/$', 'skip_item'),
    (r'^mark_items/$', 'mark_items'),
    (r'^mark_items_worker/$', 'mark_items_worker'),
    (r'^get_stats/$', 'get_stats'),
    (r'^get_learning_progress/$', 'get_learning_progress'),
    (r'^update_learning_progress/$', 'update_learning_progress'),
    (r'^change_deck/$', 'change_deck'),
    (r'^fix_learning_progress/$', 'fix_learning_progress'),
    (r'^fix_learning_record/$', 'fix_learning_record'),
    (r'^convert_learning_progress/$', 'convert_learning_progress'),
    (r'^flush_cache/$', 'flush_cache'),
    #~ (r'^(?P<lesson_id>\d+)/$', 'lesson_detail'),
)
