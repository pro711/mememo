# -*- coding: utf-8 -*-
#
# Copyright (C) 2010 Bill Chen <pro711@gmail.com>
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#

import datetime, logging
from django.core.urlresolvers import reverse
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseRedirect,Http404, HttpResponseForbidden,HttpResponse,HttpResponseNotFound, HttpResponseServerError
from django.utils.translation import ugettext_lazy as _
from django.utils.encoding import force_unicode,smart_str
from django.utils import simplejson
from google.appengine.ext import db
from google.appengine.api import urlfetch, quota
from ragendja.template import render_to_response

from apps.core.models import Card, Deck, LearningRecord, LearningProgress, CST

def range_segment(lst):
    segment_range = 20
    list_size = len(lst)
    lst.sort()
    x, y = 0, 0
    while y < list_size:
        if lst[y] - lst[x] < segment_range:
            y += 1
        else:
            yield lst[x:y]
            x = y
    yield lst[x:y]

def has_scheduled_items(request):
    if request.method == 'GET':
        # check whether logged in
        if not request.user.is_authenticated():
            result = {  'status': 'failed',
                        'message': 'user not authenticated' }
            return HttpResponse(simplejson.dumps(result))
        elif not request.user.is_active:
            result = {  'status': 'failed',
                        'message': 'user not active' }
            return HttpResponse(simplejson.dumps(result))
        
        result = {}
        s_items = LearningRecord.get_scheduled_items(request.user,0,100,0,'')
        result['scheduled_items'] = len(s_items)
        return HttpResponse(simplejson.dumps(result))
        

def get_items(request):
    if request.method == 'GET':
        # check whether logged in
        if not request.user.is_authenticated():
            result = {  'status': 'failed',
                        'message': 'user not authenticated' }
            return HttpResponse(simplejson.dumps(result))
        elif not request.user.is_active:
            result = {  'status': 'failed',
                        'message': 'user not active' }
            return HttpResponse(simplejson.dumps(result))
        
        result = {}
        result['records'] = []
        rr = result['records']  # shortcut
        today = datetime.datetime.now(tz=CST).date()
        size = int(request.GET.get('size', 20))
        # get learning progress
        learning_progress = LearningProgress.gql('WHERE _user = :1', request.user).get()
        if not learning_progress:
            # get deck first
            deck = Deck.gql('WHERE _id = 1').get()  #FIXME: GRE
            if not deck:
                logging.error('deck not found')
                raise Exception, 'deck not found'
            learning_progress = LearningProgress.create(request.user, deck)
        
        # get scheduled items first
        records = LearningRecord.get_scheduled_items(request.user,0,size,0,'')
        if len(records) < size:
            # get some new items
            new_items_size = size - len(records)
            records += LearningRecord.get_new_items(request.user,0,new_items_size,0,'')
        
        # quota
        start = quota.get_request_cpu_usage()
        # prepare response
        record_ids = [i.card_id for i in records]
        logging.debug(str(record_ids))
        #~ logging.debug(str(range_segment(record_ids)))
        for i in range_segment(record_ids):
            if len(i) > 1:
                cards = Card.gql('WHERE _id >= :1 and _id <= :2', i[0], i[-1]).fetch(i[-1]-i[0]+1)
                # filter out unrelated cards
                cards = filter(lambda x:x._id in i, cards)
            else:
                cards = [Card.gql('WHERE _id = :1', i[0]).get()]
            for card in cards:
                if card:
                    rr.append({'_id':card._id,
                                'question':card.question,
                                'answer':card.answer,
                                'note':card.note,
                                'deck_id':card.deck_id,
                                'category':card.category
                                })
        end = quota.get_request_cpu_usage()
        logging.info("prepare response cost %d megacycles." % (end - start))

        return HttpResponse(simplejson.dumps(result,sort_keys=False))

def update_item(request):
    '''Update the status of a record.'''
    if request.method == 'GET':
        # check whether logged in
        if not request.user.is_authenticated():
            result = {  'status': 'failed',
                        'message': 'user not authenticated' }
            return HttpResponse(simplejson.dumps(result))
        elif not request.user.is_active:
            result = {  'status': 'failed',
                        'message': 'user not active' }
            return HttpResponse(simplejson.dumps(result))

        _id = int(request.GET.get('_id', -1))
        new_grade = int(request.GET.get('new_grade', 0))
        if _id == -1 or not new_grade:
            result = {  'status': 'failed',
                        'message': 'error: _id or new_grade undefined' }
            return HttpResponse(simplejson.dumps(result))
        record = LearningRecord.gql('WHERE _user = :1 AND card_id = :2', request.user, _id).get()
        if not record:
            result = {  'status': 'failed',
                        'message': 'error: _id not found' }
            return HttpResponse(simplejson.dumps(result))
        
        if record.update_item(request.user,_id,new_grade):
            result = {  'status': 'succeed',
                        'message': 'update_item id=%d succeeded.' % (_id,),
                        'record': {
                            'interval': record.interval,
                            'grade'   : record.grade,
                            'easiness': record.easiness,
                            'acq_reps': record.acq_reps,
                            'ret_reps': record.ret_reps,
                            'lapses': record.lapses,
                            'acq_reps_since_lapse': record.acq_reps_since_lapse,
                            'ret_reps_since_lapse': record.ret_reps_since_lapse,
                                    }
                         }
            return HttpResponse(simplejson.dumps(result))
        else:
            result = {  'status': 'failed',
                        'message': 'error: update_item failed.',
                         }
            return HttpResponse(simplejson.dumps(result))
    
def skip_item(request):
    '''Skip an item forever.'''
    if request.method == 'GET':
        # check whether logged in
        if not request.user.is_authenticated():
            result = {  'status': 'failed',
                        'message': 'user not authenticated' }
            return HttpResponse(simplejson.dumps(result))
        elif not request.user.is_active:
            result = {  'status': 'failed',
                        'message': 'user not active' }
            return HttpResponse(simplejson.dumps(result))

        _id = int(request.GET.get('_id', -1))
        if _id == -1:
            result = {  'status': 'failed',
                        'message': 'error: _id undefined' }
            return HttpResponse(simplejson.dumps(result))
        record = LearningRecord.gql('WHERE _user = :1 AND card_id = :2', request.user, _id).get()
        if not record:
            result = {  'status': 'failed',
                        'message': 'error: _id not found' }
            return HttpResponse(simplejson.dumps(result))
        
        if record.skip():
            result = {  'status': 'succeed',
                        'message': 'skipping item id=%d succeeded.' % (_id,),
                         }
            return HttpResponse(simplejson.dumps(result))
        else:
            result = {  'status': 'failed',
                        'message': 'skipping item id=%d failed.' % (_id,),
                         }
            return HttpResponse(simplejson.dumps(result))

    
def mark_items(request):
    '''Mark items as new.'''
    if request.method == 'GET':
        # check whether logged in
        if not request.user.is_authenticated():
            result = {  'status': 'failed',
                        'message': 'user not authenticated' }
            return HttpResponse(simplejson.dumps(result))
        elif not request.user.is_active:
            result = {  'status': 'failed',
                        'message': 'user not active' }
            return HttpResponse(simplejson.dumps(result))

        MAX_SIZE = 500
        w_from = request.GET.get('from', '')
        w_to = request.GET.get('to', '')
        if not w_from or not w_to:
            result = {  'status': 'failed',
                        'message': 'error: from or to undefined' }
            return HttpResponse(simplejson.dumps(result))
        
        # get learning progress
        learning_progress = LearningProgress.gql('WHERE _user = :1', request.user).get()
        if not learning_progress:
            # get deck first
            deck = Deck.gql('WHERE _id = 1').get()  #FIXME: GRE
            if not deck:
                logging.error('deck not found')
                raise Exception, 'deck not found'
            learning_progress = LearningProgress.create(request.user, deck)
        
        q_card = Card.all()
        q_card.filter('question >',w_from).filter('question <=',w_to)
        new_cards = q_card.fetch(MAX_SIZE)
        # create learning records for these cards
        today = datetime.datetime.now(tz=CST).date()
        count = 0
        for c in new_cards:
            if LearningRecord.gql('WHERE _user = :1 AND card_id = :2', request.user, c._id).get():
                # record already exists
                continue
            r = LearningRecord(_user = request.user,
                card_id = c._id,
                date_learn = today,
                interval = 0,
                next_rep = None,
                grade = 0,
                easiness = 2.5,
                acq_reps = 0,
                ret_reps = 0,
                lapses = 0,
                acq_reps_since_lapse = 0,
                ret_reps_since_lapse = 0)
            r.put()
            count += 1
            # append to learning progress
            learning_progress.learned_items.append(c._id)
        # update learning record
        learning_progress.put()
        
        result = {  'status': 'succeed',
                    'message': '%d records created' % count }
        return HttpResponse(simplejson.dumps(result))
        
def get_stats(request):
    '''Learning statistics.'''
    
def update_learning_progress(request):
    if request.method == 'GET':
        username = request.GET.get('user', '')
        if not username:
            result = {  'status': 'failed',
                        'message': 'user not specified' }
            return HttpResponse(simplejson.dumps(result))
        user = User.gql('WHERE username = :1', username).get()
        if not user:
            result = {  'status': 'failed',
                        'message': 'user %s not found' % (username,) }
            return HttpResponse(simplejson.dumps(result))
        records = LearningRecord.gql('WHERE _user = :1', user).fetch(1000)
        record_ids = [i.card_id for i in records]
        # get learning progress
        learning_progress = LearningProgress.gql('WHERE _user = :1', user).get()
        if not learning_progress:
            # get deck first
            deck = Deck.gql('WHERE _id = 1').get()  #FIXME: GRE
            if not deck:
                logging.error('deck not found')
                raise Exception, 'deck not found'
            learning_progress = LearningProgress.create(user, deck)
        learning_progress.learned_items = sorted(record_ids)
        learning_progress.put()
        result = {  'status': 'succeed',
                    'message': 'learning_progress updated' }
        return HttpResponse(simplejson.dumps(result))
        
