#!/usr/bin/python
# -*- coding: utf-8 -*-

import unittest

class RangeList():
    @staticmethod
    def encode(_list):
        if len(_list) == 0:
            return []
        _list.sort()
        rangelist = []
        prev = _list[0]
        start = end = prev
        for i in _list[1:]:
            if i == prev+1:
                prev = end = i
            else:
                rangelist += [start,-1,end]
                start = end = prev = i
        rangelist += [start,-1,end]
        return rangelist

    @staticmethod
    def decode(rangelist):
        _list = []
        for i in range(0,len(rangelist),3):
            start = rangelist[i]
            end = rangelist[i+2]
            delimiter = rangelist[i+1]
            if delimiter != -1 or end < start:
                raise ValueError, 'Invalid triplet in rangelist: (%d,%d,%d)' % (start,end,delimiter)
            _list += range(start, end+1)
        return _list


class TestRangeList(unittest.TestCase):
    def setUp(self):
        self.encode_seqs = [[1,2,3,4,5,8,10,12,13,14,15]+range(100,10000),[]]
        self.decode_seqs = [[1,-1,5,6,-1,6,7,-1,77],[]]
        self.seqs = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 5519, 5520, 5521, 5522, 5523, 5524, 5525, 5526, 5527, 5528, 5529, 5530, 5531, 5532, 5533, 5534, 5535, 5536, 5537, 5538, 5539, 5540, 5541, 5542, 5543, 5544, 5545, 5546, 5547, 5548, 5549, 5550, 5551, 5552, 5553, 5554, 5555, 5556, 5557, 5558, 5559, 5560, 5561, 5562, 5563, 5564, 5565, 5566, 5567, 5568, 5569, 5570, 5571, 5572, 5573, 5574, 5575, 5576, 5577, 5578, 5579, 5580, 5581, 5582, 5583, 5584, 5585, 5586, 5587, 5588, 5589, 5590, 5591, 5592, 5593, 5594, 5595, 5596, 5597, 5598, 5599, 5600, 5601, 5602, 5603, 5604, 5605, 5606, 5607, 5608, 5609, 5610, 5611, 5612, 5613, 5614, 5615, 5616, 5617, 5618, 5619, 5620, 5621, 5622, 5623, 5624, 5625, 5626, 5627, 5628, 5629, 5630, 5631, 5632, 5633, 5634, 5635, 5636, 5637, 5638, 5639, 5640, 5641, 5642, 5643, 5644, 5645, 5646, 5647, 5648, 5649, 5650, 5651, 5652, 5653, 5654, 5655, 5656, 5657, 5658, 5659, 6480, 6481, 6482, 6483, 6484, 6485, 6486, 6487, 6488, 6489, 6490, 6491, 6492, 6493, 6494, 6495, 6496, 6497, 6498, 6499, 6500, 6501, 6502, 6503, 6504, 6505, 6506, 6507, 6508, 6509, 6510, 6511, 6512, 6513, 6514, 6515, 6516, 6517, 6518, 6519, 6520, 6521, 6522, 6523, 6524, 6525, 6526, 6527, 6528, 6529, 6530, 6531, 6532, 6533, 6534, 6535, 6536, 6537, 6538, 6539, 6540, 6541, 6542, 6543, 6544, 6545, 6546, 6547, 6548, 6549, 6550, 6551, 6552, 6553, 6554, 6895, 6896, 6897, 6898, 6899, 6900, 6901, 6902, 6903, 6904]]

    def test_encode(self):
        for seq in self.encode_seqs:
            rl = RangeList.encode(seq)
            print rl
        #~ self.assertTrue(rl)

    def test_decode(self):
        for seq in self.decode_seqs:
            lst = RangeList.decode(seq)
            print lst
        #~ self.assertTrue(lst)
    
    def test_encode_decode(self):
        for seq in self.seqs:
            rl = RangeList.encode(seq)
            print rl
            lst = RangeList.decode(rl)
            self.assertEqual(seq, lst)

if __name__ == '__main__':
       unittest.main() 

