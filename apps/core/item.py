# -*- coding: utf-8 -*-
#
#   Copyright 2010 Bill Chen <pro711@gmail.com>
#
#   This program is free software: you can redistribute it and/or modify
#   it under the terms of the GNU General Public License as published by
#   the Free Software Foundation, either version 3 of the License, or
#   (at your option) any later version.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU General Public License for more details.
#
#   You should have received a copy of the GNU General Public License
#   along with this program.  If not, see <http://www.gnu.org/licenses/>
#
import random, time, os, string, sys, logging, re
import datetime, copy

#~ from apps.core.models import Card, Deck, LearningRecord
class FixedOffset(datetime.tzinfo):
    """Fixed offset in minutes east from UTC."""
    def __init__(self, offset, name):
        self.__offset = datetime.timedelta(minutes = offset)
        self.__name = name

    def utcoffset(self, dt):
        return self.__offset

    def tzname(self, dt):
        return self.__name

    def dst(self, dt):
        return datetime.timedelta(0)

CST = FixedOffset(480,"China Standard Time")

class Item(object):
    def __init__(self, card, record=None):
        #~ if not card:
            #~ raise TypeError, 'card should not be None'
        if not record:
            # new record
            #~ self.date_learn = datetime.datetime.now()
            self.interval = 0
            self.grade = 0
            self.easiness = 2.5
            self.acq_reps = 0
            self.ret_reps = 0
            self.lapses = 0
            self.acq_reps_since_lapse = 0
            self.ret_reps_since_lapse = 0
        else:
            self.date_learn = record.date_learn
            self.interval = record.interval
            self.next_rep = record.next_rep
            self.grade = record.grade
            self.easiness = record.easiness
            self.acq_reps = record.acq_reps
            self.ret_reps = record.ret_reps
            self.lapses = record.lapses
            self.acq_reps_since_lapse = record.acq_reps_since_lapse
            self.ret_reps_since_lapse = record.ret_reps_since_lapse
    
    def calculate_initial_interval(self, grade):
        # If this is the first time we grade this item, allow for slightly
        # longer scheduled intervals, as we might know this item from before.
        interval = (0, 0, 1, 3, 4, 5) [grade]
        return interval
    
    def calculate_interval_noise(self, interval):
        if interval == 0:
            noise = 0
        elif interval == 1:
            noise = random.randint(0,1)
        elif interval <= 10:
            noise = random.randint(-1,1)
        elif interval <= 60:
            noise = random.randint(-3,3)
        else:
            a = .05 * interval
            noise = round(random.uniform(-a,a))

        return noise
    
    def diff_date(self, date1, date2):
        delta = date2 - date1
        return delta.days
    
    def increment_date(self, date1, days):
        delta = datetime.timedelta(days)
        return date1 + delta
    
    def process_answer(self, new_grade, dry_run=False):
        '''
        dryRun will leave the original one intact and return the interval
        '''

        # When doing a dry run, make a copy to operate on. Note that this
        # leaves the original in items and the reference in the GUI intact.

        if dry_run:
            item = copy.copy(item)

        # Calculate scheduled and actual interval, taking care of corner
        # case when learning ahead on the same day.
        
        scheduled_interval = self.interval
        actual_interval    = self.diff_date(self.date_learn, datetime.datetime.now(tz=CST).date())
        new_interval = 0
        
        retval = False
        
        if actual_interval == 0:
            actual_interval = 1 # Otherwise new interval can become zero.

        if self.acq_reps == 0:
            # The item is not graded yet, e.g. because it is imported.
            self.acq_reps = 1
            self.acq_reps_since_lapse = 1
            self.easiness = 2.5
            new_interval = self.calculate_initial_interval(new_grade)
            if new_grade >= 2:
                retval = True
        elif self.grade in [0,1] and new_grade in [0,1]:
            # In the acquisition phase and staying there.
            self.acq_reps += 1
            self.acq_reps_since_lapse += 1
            
            new_interval = 0
        elif self.grade in [0,1] and new_grade in [2,3,4,5]:
            # In the acquisition phase and moving to the retention phase.
            self.acq_reps += 1
            self.acq_reps_since_lapse += 1

            new_interval = 1
            retval = True
        elif self.grade in [2,3,4,5] and new_grade in [0,1]:

             # In the retention phase and dropping back to the acquisition phase.

            self.ret_reps += 1
            self.lapses += 1
            self.acq_reps_since_lapse = 0
            self.ret_reps_since_lapse = 0

            new_interval = 0
            returnValue = False

        elif self.grade in [2,3,4,5] and new_grade in [2,3,4,5]:

            # In the retention phase and staying there.

            self.ret_reps += 1
            self.ret_reps_since_lapse += 1
            retval = True
            
            logging.debug('scheduled_interval: %d, actual_interval: %d' % (scheduled_interval,actual_interval))
            if actual_interval >= scheduled_interval:
                if new_grade == 2:
                    self.easiness -= 0.16
                if new_grade == 3:
                    self.easiness -= 0.14
                if new_grade == 5:
                    self.easiness += 0.10
                if self.easiness < 1.3:
                    self.easiness = 1.3
                
            new_interval = 0
            
            if self.ret_reps_since_lapse == 1:
                new_interval = 6
            else:
                if new_grade == 2 or new_grade == 3:
                    if actual_interval <= scheduled_interval:
                        new_interval = actual_interval * self.easiness
                    else:
                        new_interval = scheduled_interval
                        
                if new_grade == 4:
                    new_interval = actual_interval * self.easiness
                    
                if new_grade == 5:
                    if actual_interval < scheduled_interval:
                        new_interval = scheduled_interval # Avoid spacing.
                    else:
                        new_interval = actual_interval * self.easiness

            # Shouldn't happen, but build in a safeguard.

            if new_interval == 0:
                logger.info("Internal error: new interval was zero.")
                new_interval = scheduled_interval

            new_interval = int(new_interval)

        # When doing a dry run, stop here and return the scheduled interval.
        if dry_run:
            return new_interval

        # Add some randomness to interval.
        noise = self.calculate_interval_noise(new_interval)

        # Update grade and interval.
        self.date_learn = datetime.datetime.now(tz=CST).date()
        self.interval = new_interval + noise
        self.next_rep = self.date_learn + datetime.timedelta(self.interval)
        self.grade    = new_grade
        
        #~ # Don't schedule inverse or identical questions on the same day.
#~ 
        #~ for j in items:
            #~ if (j.q == self.q and j.a == self.a) or items_are_inverses(item, j):
                #~ if j != item and j.next_rep == self.next_rep and self.grade >= 2:
                    #~ self.next_rep += 1
                    #~ noise += 1
                    
        #~ # Create log entry.
            #~ 
        #~ logger.info("R %s %d %1.2f | %d %d %d %d %d | %d %d | %d %d | %1.1f",
                    #~ self.id, self.grade, self.easiness,
                    #~ self.acq_reps, self.ret_reps, self.lapses,
                    #~ self.acq_reps_since_lapse, self.ret_reps_since_lapse,
                    #~ scheduled_interval, actual_interval,
                    #~ new_interval, noise, thinking_time)

        return 1 if retval else 0   # 1 for success, 0 for fail

    def is_scheduled(self):
        scheduled_interval = self.interval
        actual_interval    = self.diff_date(self.date_learn, datetime.datetime.now(tz=CST).date())
        if scheduled_interval <= actual_interval and self.acq_reps > 0:
            return True
        else:
            return False
    
    
    def reset_learning_data(self):
        self.interval = 0
        self.grade = 0
        self.easiness = 2.5
        self.acq_reps = 0
        self.ret_reps = 0
        self.lapses = 0
        self.acq_reps_since_lapse = 0
        self.ret_reps_since_lapse = 0
        
        self.last_rep  = 0 # In days since beginning.
        self.next_rep  = 0 #
        
        

