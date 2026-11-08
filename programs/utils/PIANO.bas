10 rem *** sid piano ***
20 s=54272:poke 53280,0:poke 53281,0
30 for i=0 to 24:poke s+i,0:next:poke s+24,15
40 poke s+2,0:poke s+3,8:poke s+5,9:poke s+6,240
50 wv=17:dim fq(13),mk(13)
60 for i=0 to 12:read mk(i),fq(i):next
70 data 10,4455,9,4720,13,5001,14,5298,18,5613,21,5947,22,6300,26,6675,25,7072,29,7493,30,7938,34,8410,37,8910
80 print "{147}{158}   S I D   P I A N O":print
90 print "{5}    W E   T Y U"
100 print "   {18}A{146} {18}S{146} {18}D{146} {18}F{146} {18}G{146} {18}H{146} {18}J{146} {18}K{146}"
110 print:print "{159}   HOLD KEYS TO PLAY. WHITE KEYS:"
120 print "   A S D F G H J K  (C D E F G A B C)"
130 print "   SHARPS: W E T Y U (ROW ABOVE)":print
140 print "{5}   1 TRI  2 SAW  3 PULSE  4 NOISE"
150 print "   RUN/STOP TO QUIT":print
160 w$="TRIANGLE":gosub 300
170 k=peek(197):g=0
180 for i=0 to 12:if k=mk(i) then g=1:poke s,fq(i) and 255:poke s+1,int(fq(i)/256)
190 next
200 poke s+4,wv+g-1
210 get a$:if a$="1" then wv=17:w$="TRIANGLE":gosub 300
220 if a$="2" then wv=33:w$="SAWTOOTH":gosub 300
230 if a$="3" then wv=65:w$="PULSE   ":gosub 300
240 if a$="4" then wv=129:w$="NOISE   ":gosub 300
250 goto 170
300 poke 781,15:poke 782,3:poke 783,0:sys 65520:print "{158}WAVEFORM: ";w$;"  ":return
