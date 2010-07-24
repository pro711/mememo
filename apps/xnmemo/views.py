# -*- coding: utf-8 -*-
import datetime
from django.core.urlresolvers import reverse
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseRedirect,Http404, HttpResponseForbidden,HttpResponse,HttpResponseNotFound, HttpResponseServerError
from django.utils.translation import ugettext_lazy as _
from django.utils.encoding import force_unicode,smart_str
from django.utils import simplejson
from google.appengine.ext import db
from google.appengine.api import urlfetch
from ragendja.template import render_to_response

from apps.core.models import Card, Deck, LearningRecord



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
        today = datetime.date.today()
        size = int(request.GET.get('size', 20))
        
        # get scheduled items first
        records = LearningRecord.get_scheduled_items(request.user,0,size,0,'')
        if len(records) < size:
            # get some new items
            new_items_size = size - len(records)
            records += LearningRecord.get_new_items(request.user,0,new_items_size,0,'')
        
        # prepare response
        # FIXME: performance tuning
        for i in records:
            card = Card.gql('WHERE _id = :1', i.card_id).get()
            if card:
                rr.append({'_id':card._id,
                            'question':card.question,
                            'answer':card.answer,
                            'note':card.note,
                            'deck_id':card.deck_id,
                            'category':card.category
                            })
        
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
        
        q_card = Card.all()
        q_card.filter('question >',w_from).filter('question <=',w_to)
        new_cards = q_card.fetch(MAX_SIZE)
        # create learning records for these cards
        today = datetime.date.today()
        count = 0
        for c in new_cards:
            if LearningRecord.gql('WHERE _user = :1 AND card_id = :2', request.user, c._id).get():
                # record already exists
                continue
            r = LearningRecord(_user = request.user,
                card_id = c._id,
                date_learn = today,
                interval = 0,
                next_rep = today,
                grade = 0,
                easiness = 2.5,
                acq_reps = 0,
                ret_reps = 0,
                lapses = 0,
                acq_reps_since_lapse = 0,
                ret_reps_since_lapse = 0)
            r.put()
            count += 1
        
        result = {  'status': 'succeed',
                    'message': '%d records created' % count }
        return HttpResponse(simplejson.dumps(result))
        
def get_stats(request):
    '''Learning statistics.'''
    
