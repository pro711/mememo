# -*- coding: utf-8 -*-
from django.utils.translation import ugettext_lazy as _
from google.appengine.ext import db
from django.contrib.auth.models import User

import random, datetime

from apps.core.item import Item


class Card(db.Model):
    """A card in a deck."""
    # CREATE TABLE dict_tbl(_id INTEGER PRIMARY KEY ASC AUTOINCREMENT, question TEXT, answer TEXT, note TEXT, category TEXT)
    _id = db.IntegerProperty(required=True, default=0)
    question = db.StringProperty(required=True)
    answer = db.StringProperty()
    note = db.TextProperty()
    deck_id = db.IntegerProperty(required=True, default=0)
    category = db.StringProperty()

    def __unicode__(self):
        return '%s %s' % (self._id, self.question)


class Deck(db.Model):
    """A collection of cards."""
    _id = db.IntegerProperty(required=True, default=0)
    name = db.StringProperty(required=True)
    description = db.StringProperty(multiline=True)
    volume = db.IntegerProperty(required=True, default=0)

    def __unicode__(self):
        return '%s' % (self.name,)

class LearningRecord(db.Model):
    '''Learing record for a card.'''
    # CREATE TABLE learn_tbl(_id INTEGER PRIMARY KEY ASC AUTOINCREMENT, date_learn, interval INTEGER, grade INTEGER, easiness REAL, acq_reps INTEGER, ret_reps INTEGER, lapses INTEGER, acq_reps_since_lapse INTEGER, ret_reps_since_lapse INTEGER)
    #~ _id = db.IntegerProperty(required=True, default=0)
    _user = db.ReferenceProperty(User)
    card_id = db.IntegerProperty(required=True)
    date_learn = db.DateProperty(auto_now=True)
    interval = db.IntegerProperty(required=True, default=0)
    next_rep = db.DateProperty()
    grade = db.IntegerProperty(required=True, default=0)
    easiness = db.FloatProperty(required=True, default=2.5)
    acq_reps = db.IntegerProperty(required=True, default=0)
    ret_reps = db.IntegerProperty(required=True, default=0)
    lapses = db.IntegerProperty(required=True, default=0)
    acq_reps_since_lapse = db.IntegerProperty(required=True, default=0)
    ret_reps_since_lapse = db.IntegerProperty(required=True, default=0)
    
    def __unicode__(self):
        return '%s: %s' % (self._user, self.card_id)
    
    @classmethod
    def get_scheduled_items(self, user, id, size, flag, flt):
        '''
        Return a list of items.
            id: from which ID
            flag = 0 means no condition
            flag = 1 means new items, the items user have never seen (acq=0)
            flag = 2 means item due, they need to be reviewed. (ret)
            flag = 3 means items that is ahead of time (cram)
            flag = 4 means both ret and acq items, but ret comes first
            flag = 5: shuffle items no other condition
        '''
        # limit number of items to MAX_SIZE
        MAX_SIZE = 100
        size  = min(size,MAX_SIZE)
        
        today = datetime.date.today()
        q = LearningRecord.gql('WHERE _user = :1 AND next_rep <= :2 ORDER BY next_rep', user, today)
        results = q.fetch(size)
        results = filter(lambda x:x.acq_reps >= 0, results)
        #~ raise Exception
        # sort results by card_id
        results.sort(key=lambda x:x.card_id)
        return results
    
    @classmethod    
    def get_new_items(self, user, id, size, flag, flt):
        '''
        Return a list of items.
            id: from which ID
            flag = 0 means no condition
            flag = 1 means new items, the items user have never seen (acq=0)
            flag = 2 means item due, they need to be reviewed. (ret)
            flag = 3 means items that is ahead of time (cram)
            flag = 4 means both ret and acq items, but ret comes first
            flag = 5: shuffle items no other condition
        '''
        # limit number of items to MAX_SIZE
        MAX_SIZE = 100
        size  = min(size,MAX_SIZE)
        q = LearningRecord.gql('WHERE _user = :1 AND acq_reps = :2', user, 0)
        results = q.fetch(size)
        if len(results) >=  size:
            # we have fetched enough records
            return results
        else:
            # create some records
            new_items_size = size - len(results)
            count = 0
            #~ while count < new_items_size:
            last_card = LearningRecord.gql('WHERE _user = :1 ORDER BY card_id DESC', user).get()
            if not last_card:
                # we do not have any records now
                last_card_id = 0
            else:
                last_card_id = last_card.card_id
            # get some cards
            #~ q_card = Card.gql('WHERE card_id > :1 ORDER BY card_id LIMIT :2', last_card_id, new_items_size)
            # LIMIT do not support bound parameters, use query instead
            q_card = Card.all()
            q_card.filter('_id >',last_card_id).order('_id')
            new_cards = q_card.fetch(new_items_size)
            #~ raise Exception
            # create learning records for these cards
            today = datetime.date.today()
            for c in new_cards:
                r = LearningRecord(_user = user,
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
                # add to results
                results.append(r)
            return results
        
    def update_item(self, user, id, new_grade):
        '''Update an item.'''
        card = Card.gql('WHERE _id = :1', self.card_id).get()
        if not card:
            return False
        # process answer
        item = Item(card, self)
        item.process_answer(new_grade)
    
        self.date_learn = item.date_learn
        self.interval = item.interval
        self.next_rep = item.next_rep
        self.grade    = item.grade
        self.easiness = item.easiness 
        self.acq_reps = item.acq_reps 
        self.ret_reps = item.ret_reps 
        self.lapses = item.lapses 
        self.acq_reps_since_lapse = item.acq_reps_since_lapse 
        self.ret_reps_since_lapse = item.ret_reps_since_lapse 
        
        self.put()
        return True
    

    
    
