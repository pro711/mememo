# -*- coding: utf-8 -*-

import os,logging,csv,codecs,cStringIO
from django.http import HttpResponseRedirect,Http404,HttpResponseForbidden,HttpResponse,HttpResponseNotFound
from django.utils.translation import ugettext as _
from ragendja.template import render_to_response

from apps.core.models import Card, Deck

#~ def sqlite_import(request, dbfn, deckname, deckdesc):
    #~ '''import from sqlite database (AnyMemo format)'''
    #~ response = ''
    #~ # open database file
    #~ _localDir=os.path.dirname(__file__)
    #~ _curpath=os.path.normpath(os.path.join(os.getcwd(),_localDir))
    #~ curpath=_curpath
    #~ try:
        #~ conn = sqlite3.connect(s.path.join(curpath,dbfile))
    #~ except:
        #~ logging.error('Error opening sqlite file!')
        #~ return HttpResponse('Error opening sqlite file!')
    #~ q = Deck.all()
    #~ q.filter("name =", deckname)
    #~ deck = q.get()
    #~ if not deck:
        #~ # determine deck id
        #~ q = Deck.all()
        #~ q.order("-_id")
        #~ results = q.fetch(1)
        #~ if len(results) == 0:
            #~ last_id = 0
        #~ else:
            #~ last_id = results[0].book_id
        #~ new_id = last_id + 1
        #~ # create a new deck
        #~ volume = 0
        #~ deck = Deck(_id=new_id, name=deckname,description=deckdesc,volume=0)
    #~ else:
        #~ volume = deck.volume
    #~ # import cards from sqlite database, 100 cards per session
    #~ start_card = volume + 1
    #~ c = conn.cursor()
    #~ t = (start_card,)
    #~ c.execute('select * from dict_tbl where _id>=? order by _id limit 100')
    #~ for row in c:
        #~ response += (str(row) + '\n')
    #~ return HttpResponse(response)
    
class UTF8Recoder:
    """
    Iterator that reads an encoded stream and reencodes the input to UTF-8
    """
    def __init__(self, f, encoding):
        self.reader = codecs.getreader(encoding)(f)

    def __iter__(self):
        return self

    def next(self):
        return self.reader.next().encode("utf-8")

class UnicodeReader:
    """
    A CSV reader which will iterate over lines in the CSV file "f",
    which is encoded in the given encoding.
    """

    def __init__(self, f, dialect=csv.excel, encoding="utf-8", **kwds):
        f = UTF8Recoder(f, encoding)
        self.reader = csv.reader(f, dialect=dialect, **kwds)

    def next(self):
        row = self.reader.next()
        return [unicode(s, "utf-8") for s in row]

    def __iter__(self):
        return self

class UnicodeWriter:
    """
    A CSV writer which will write rows to CSV file "f",
    which is encoded in the given encoding.
    """

    def __init__(self, f, dialect=csv.excel, encoding="utf-8", **kwds):
        # Redirect output to a queue
        self.queue = cStringIO.StringIO()
        self.writer = csv.writer(self.queue, dialect=dialect, **kwds)
        self.stream = f
        self.encoder = codecs.getincrementalencoder(encoding)()

    def writerow(self, row):
        self.writer.writerow([s.encode("utf-8") for s in row])
        # Fetch UTF-8 output from the queue ...
        data = self.queue.getvalue()
        data = data.decode("utf-8")
        # ... and reencode it into the target encoding
        data = self.encoder.encode(data)
        # write to the target stream
        self.stream.write(data)
        # empty queue
        self.queue.truncate(0)

    def writerows(self, rows):
        for row in rows:
            self.writerow(row)

def csv_import(request, dbfile, deckname, deckdesc):
    '''import from csv file'''
    response = ''
    # open csv file
    _localDir=os.path.dirname(__file__)
    _curpath=os.path.normpath(os.path.join(os.getcwd(),_localDir))
    curpath=_curpath
    csvf = open(os.path.join(curpath,dbfile),'r')
    csv_reader = UnicodeReader(csvf, delimiter='\t', quotechar='|', quoting=csv.QUOTE_MINIMAL)
    
    q = Deck.all()
    q.filter("name =", deckname)
    deck = q.get()
    if not deck:
        # determine deck id
        q = Deck.all()
        q.order("-_id")
        results = q.fetch(1)
        if len(results) == 0:
            last_id = 0
        else:
            last_id = results[0].book_id
        new_id = last_id + 1
        # create a new deck
        volume = 0
        deck = Deck(_id=new_id, name=deckname,description=deckdesc,volume=0)
        deck.put()
    else:
        volume = deck.volume
    # import cards from sqlite database, 500 cards per session
    start_card = volume + 1
    t = (start_card,)
    count = 0
    for row in csv_reader:
        if int(row[0]) >= start_card:
            card = Card(_id=int(row[0]), question=row[1], answer = row[2], note = row[3],
                    deck_id=deck._id, category=row[4])
            card.put()
            count += 1
            if count >= 500:
                break
    # update volume
    deck.volume += count
    deck.put()
    return HttpResponse('%d cards imported.' % (count,))
    
def db_import(request):
    if request.method == 'GET':
        dbfile = request.GET.get('dbfile',None)
        deckname = request.GET.get('deckname','')
        deckdesc = request.GET.get('deckdesc','')
        if not dbfile:
            return render_to_response(request, "dbbuilder/db_import.html")
        else:
            if dbfile.endswith('.csv'):
                # import from csv file
                return csv_import(request,dbfile,deckname,deckdesc)

