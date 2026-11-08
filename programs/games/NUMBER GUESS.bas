10 rem *** number guess ***
20 poke 53280,6:poke 53281,6:be=0
30 print "{147}{158}":print "   N U M B E R   G U E S S":print
40 print "{5}   I AM THINKING OF A NUMBER"
50 print "   FROM 1 TO 100.":print
60 n=int(rnd(1)*100)+1:g=0:lo=1:hi=100
70 print "{158}   YOUR GUESS";:input a$:a=val(a$)
80 if a<lo or a>hi then print "{28}   BETWEEN";lo;"AND";hi;"PLEASE":goto 70
90 g=g+1
100 if a<n then lo=a+1:print "{5}   TOO LOW.":goto 70
110 if a>n then hi=a-1:print "{5}   TOO HIGH.":goto 70
120 print:print "{153}   YES! IT WAS";n;"."
130 print "   YOU TOOK";g;"GUESSES."
140 if g<=7 then print "{158}   EXCELLENT! THAT'S AS GOOD AS A COMPUTER."
150 if g>7 and g<=10 then print "{158}   NICE WORK."
160 if g>10 then print "{158}   HINT: GUESS THE MIDDLE EACH TIME."
170 if be=0 or g<be then be=g:print "{159}   NEW BEST!"
180 print "{5}   BEST:";be:print
190 print "   PLAY AGAIN? (Y/N)"
200 get k$:if k$="" then 200
210 if k$="Y" then print:goto 60
220 print "{147}":end
