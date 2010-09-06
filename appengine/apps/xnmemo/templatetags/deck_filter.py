from django import template

register = template.Library()


def get_deck_id(deck):
    '''Workaround for deck._id'''
    return deck._id

get_deck_id = register.filter(get_deck_id)
