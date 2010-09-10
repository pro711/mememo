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
from functools import wraps
from django.core.urlresolvers import reverse
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseRedirect,Http404, HttpResponseForbidden,HttpResponse,HttpResponseNotFound, HttpResponseServerError
from django.utils.translation import ugettext_lazy as _
from django.utils.encoding import force_unicode,smart_str
from django.utils import simplejson
from django.views.decorators.http import require_GET, require_POST
from google.appengine.ext import db
from google.appengine.api import urlfetch, quota, memcache
from google.appengine.api.labs import taskqueue
from ragendja.template import render_to_response

from apps.core.models import Card, Deck, LearningRecord, LearningProgress, CST
from rangelist import RangeList

def range_segment(lst, segment_range=20):
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


def http_get(f):
    def forbidden(request):
        return HttpResponseForbidden('ONLY GET IS ALLOWED')
    @wraps(f)
    def wrapper(request, *args, **kwds):
        if request.method == 'GET':
            return f(request, *args, **kwds)
        else:
            return HttpResponseForbidden('ONLY GET IS ALLOWED')
    return wrapper

def require_login(f):
    @wraps(f)
    def wrapper(request, *args, **kwds):
        # check whether logged in
        if not request.user.is_authenticated():
            result = {  'status': 'failed',
                        'message': 'user not authenticated' }
            return HttpResponse(simplejson.dumps(result))
        elif not request.user.is_active:
            result = {  'status': 'failed',
                        'message': 'user not active' }
            return HttpResponse(simplejson.dumps(result))
        else:
            return f(request, *args, **kwds)
    return wrapper

@require_GET
@require_login
def has_scheduled_items(request):
    limit = int(request.GET.get('limit', 0))
    size = limit if limit else 100
    result = {}
    s_items = LearningRecord.get_scheduled_items(request.user,0,100,0,'')
    result['scheduled_items_count'] = len(s_items)
    result['scheduled_items'] = [item.card_id for item in s_items]
    return HttpResponse(simplejson.dumps(result))
        

@require_GET
@require_login
def get_items(request):
    result = {}
    result['records'] = []
    rr = result['records']  # shortcut
    today = datetime.datetime.now(tz=CST).date()
    size = int(request.GET.get('size', 20))
    
    # quota
    start = quota.get_request_cpu_usage()
    # get learning progress
    learning_progress = memcache.get('learning_progress'+request.user.username)
    if learning_progress is not None:
        pass
    else:
        learning_progress = LearningProgress.gql('WHERE _user = :1 AND active = TRUE', request.user).get()
        if not learning_progress:
            # get deck first
            deck = Deck.gql('WHERE _id = 1').get()  #FIXME: GRE
            if not deck:
                logging.error('deck not found')
                raise Exception, 'deck not found'
            learning_progress = LearningProgress.create(request.user, deck)
            learning_progress.active = True
            learning_progress.put()
        # put into memcache
        memcache.add('learning_progress'+request.user.username,learning_progress,3600)
    
    deck = learning_progress._deck
    
    end = quota.get_request_cpu_usage()
    logging.info("get learning_progress cost %d megacycles." % (end - start))

    
    # quota
    start = quota.get_request_cpu_usage()
    # get scheduled items first
    records = LearningRecord.get_scheduled_items(request.user,deck,0,size,0,'')
    if len(records) < size:
        # get some new items
        new_items_size = size - len(records)
        records += LearningRecord.get_new_items(request.user,deck,0,new_items_size,0,'')
    end = quota.get_request_cpu_usage()
    logging.info("fetch items cost %d megacycles." % (end - start))
    
    # quota
    start = quota.get_request_cpu_usage()
    # prepare response
    record_ids = [i.card_id for i in records]
    logging.debug('All: '+str(record_ids))

    # check memcache first
    cached = []
    for i in record_ids:
        card = memcache.get(key='mememo_card'+str(i))
        if card is not None:
            rr.append({'_id':card._id,
                        'question':card.question,
                        'answer':card.answer,
                        'note':card.note,
                        'deck_id':card.deck_id,
                        'category':card.category
                        })
            cached.append(i)
    record_ids = list(set(record_ids) - set(cached))
    logging.debug('fetching cards from datestore: '+str(record_ids))
    # otherwise we have to fetch them from datastore
    for i in range_segment(record_ids):
        if len(i) > 1:
            cards = Card.gql('WHERE _id >= :1 and _id <= :2', i[0], i[-1]).fetch(i[-1]-i[0]+1)
            # filter out unrelated cards
            cards = filter(lambda x:x._id in i, cards)
        elif len(i) == 1:
            cards = [Card.gql('WHERE _id = :1', i[0]).get()]
        else:
            continue
        
        # add to memcache
        for card in cards:
            if not memcache.set(key='mememo_card'+str(card._id), value=card, time=7200):
                logging.error('memcache set item failed: '+ str(card._id))
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
        new_grade = int(request.GET.get('new_grade', -1))
        if _id == -1 or new_grade == -1:
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
        learning_progress = LearningProgress.gql('WHERE _user = :1 AND active = TRUE', request.user).get()
        if not learning_progress:
            # get deck first
            deck = Deck.gql('WHERE _id = 1').get()  #FIXME: GRE
            if not deck:
                logging.error('deck not found')
                raise Exception, 'deck not found'
            learning_progress = LearningProgress.create(request.user, deck)
            learning_progress.active = True
            learning_progress.put()
        
        q_card = Card.all()
        q_card.filter('deck_id =', learning_progress._deck._id).filter('question >',w_from).filter('question <=',w_to)
        new_cards = q_card.fetch(MAX_SIZE)

        count = 0
        new_cards_ids = [c._id for c in new_cards]
        for g in range_segment(new_cards_ids):
            # Add the task to the mark-items-queue queue.
            taskqueue.add(queue_name='mark-items-queue', 
                url='/xnmemo/mark_items_worker/',
                params={'username': request.user.username,
                        'card_ids': '_'.join([str(c) for c in g])})
            count += len(g)
        
        result = {  'status': 'succeed',
                    'message': '%d records queued to be created.' % count }
        return HttpResponse(simplejson.dumps(result))

def mark_items_worker(request):
    '''Worker for mark_items.'''
    if request.method == 'POST':
        username = request.POST.get('username', '')
        card_ids_joined = request.POST.get('card_ids', '')
        card_ids = [int(c) for c in card_ids_joined.split('_')]
        # get user
        user = User.gql('WHERE username = :1', username).get()
        if not user:
            result = {  'status': 'failed',
                        'message': 'user does not exist' }
            return HttpResponse(simplejson.dumps(result))
        
        # create learning record
        today = datetime.datetime.now(tz=CST).date()
        # get learning progress
        learning_progress = LearningProgress.gql('WHERE _user = :1 AND active = TRUE', user).get()
        learned_items_list = RangeList.decode(learning_progress.learned_items)
        for card_id in card_ids:
            if LearningRecord.gql('WHERE _user = :1 AND card_id = :2', user, card_id).get():
                # record already exists
                continue

            r = LearningRecord(_user = user,
                card_id = card_id,
                deck_id = learning_progress._deck._id,
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
            # append to learning progress
            learned_items_list.append(card_id)
        # update learning record
        learning_progress.learned_items = RangeList.encode(learned_items_list)
        learning_progress.put()
        # prepare response
        result = {  'status': 'succeed',
                    'message': 'learning record for card %s created.' % card_ids_joined }
        return HttpResponse(simplejson.dumps(result))
        
def get_stats(request):
    '''Learning statistics.'''

@require_GET
@require_login
def get_learning_progress(request):
    # get learning progress
    learning_progress = LearningProgress.gql('WHERE _user = :1', request.user).get()
    if learning_progress:
        learned_items_list = RangeList.decode(learning_progress.learned_items)
        result = {  'status': 'succeed',
                    'learned_items': learned_items_list,
                    'learned_items_count': len(learned_items_list) }
    else:
        result = {  'status': 'failed',
                    'message': 'learning_progress not found' }
    return HttpResponse(simplejson.dumps(result))

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
        learning_progress.learned_items = RangeList.encode(sorted(record_ids))
        learning_progress.put()
        result = {  'status': 'succeed',
                    'message': 'learning_progress updated' }
        return HttpResponse(simplejson.dumps(result))

@require_login
def change_deck(request):
    if request.method == 'GET':
        decks = Deck.all().fetch(1000)
        active_learning_progress = LearningProgress.gql('WHERE _user = :1 AND active = TRUE', request.user).get()
        if active_learning_progress:
            current_deck = active_learning_progress._deck
        else:
            current_deck = None
        template_vals = {'current_deck': current_deck,
            'decks': decks,
            'message': None}
        return render_to_response(request, 'xnmemo/change_deck.html', template_vals)
    elif request.method == 'POST':
        decks = Deck.all().fetch(1000)
        deck_id = int(request.POST.get('deck', 0))
        if deck_id:
            active_learning_progress = LearningProgress.gql('WHERE _user = :1 AND active = TRUE', request.user).get()
            if active_learning_progress:
                current_deck = active_learning_progress._deck
                if current_deck._id ==  deck_id:
                    # no need to change
                    message = 'Deck is not changed.'
                else:
                    new_deck = Deck.gql('WHERE _id = :1', deck_id).get()
                    learning_progresses = LearningProgress.gql('WHERE _user = :1', request.user).fetch(1000)
                    learning_progresses = filter(lambda x:x._deck==new_deck, learning_progresses)
                    if learning_progresses:
                        new_learning_progress = learning_progresses[0]
                    else:
                        new_learning_progress = None
                    if not new_learning_progress:
                        new_learning_progress = LearningProgress.create(request.user, new_deck)
                    active_learning_progress.active = False
                    active_learning_progress.put()
                    new_learning_progress.active = True
                    new_learning_progress.put()
                    current_deck = new_deck
                    message = 'Deck changed to %s.' % (new_deck,)
            else:
                new_deck = Deck.gql('WHERE _id = :1', deck_id).get()
                learning_progresses = LearningProgress.gql('WHERE _user = :1', request.user).fetch(1000)
                learning_progresses = filter(lambda x:x._deck==new_deck, learning_progresses)
                if learning_progresses:
                    new_learning_progress = learning_progresses[0]
                else:
                    new_learning_progress = None
                if not new_learning_progress:
                    new_learning_progress = LearningProgress.create(request.user, new_deck)
                new_learning_progress.active = True
                new_learning_progress.put()
                current_deck = new_deck
                message = 'Deck changed to %s.' % (new_deck,)
            # delete learning_progress from memcache
            memcache.delete('learning_progress'+request.user.username)
            # prepare response
            template_vals = {'current_deck': current_deck,
                'decks': decks,
                'message': message}
            return render_to_response(request, 'xnmemo/change_deck.html', template_vals)

def fix_learning_progress(request):
    lps = LearningProgress.all().fetch(1000)
    for lp in lps:
        lp.active = True
        lp.put()
    return HttpResponse('%d LearningProgresses fixed.' % (len(lps),))

@require_GET
def fix_learning_record(request):
    start_id = int(request.GET.get('from', 0))
    end_id = int(request.GET.get('to', 0))
    if not start_id or not end_id:
        result = {  'status': 'failed',
                    'message': 'error: from or to undefined' }
        return HttpResponse(simplejson.dumps(result))
    decks = Deck.all().fetch(1000)
    records = LearningRecord.gql('WHERE card_id >= :1 AND card_id <= :2', start_id, end_id).fetch(1000)
    for r in records:
        for d in decks:
            if r.card_id >= d.first_card_id and r.card_id <= d.last_card_id:
                if not r.deck_id:
                    r.deck_id = d._id
                    r.put()
    return HttpResponse('%d records fixed, from id: %d to id: %d' % (len(records),start_id,end_id))
    

def convert_learning_progress(request):
    lps = LearningProgress.all().fetch(1000)
    for lp in lps:
        lp.learned_items = RangeList.encode(lp.learned_items)
        lp.put()
    return HttpResponse('%d LearningProgresses fixed.' % (len(lps),))

def flush_cache(request):
    '''Flush memcache.'''
    if memcache.flush_all():
        return HttpResponse('Flush cache success.')
    else:
        return HttpResponse('Flush cache failed.')
    
        
