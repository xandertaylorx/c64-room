10 rem *** codebreaker ***
20 poke 53280,6:poke 53281,6:dim c(4),g(4),u(4),v(4)
30 print "{147}{158}":print "   C O D E B R E A K E R":print
40 print "{5}   THE COMPUTER HAS MADE A SECRET CODE"
50 print "   OF 4 DIGITS, EACH FROM 1 TO 6."
60 print "   DIGITS CAN REPEAT.":print
70 print "   AFTER EACH GUESS YOU GET:"
80 print "{158}   *{5} = RIGHT DIGIT, RIGHT PLACE"
90 print "{158}   +{5} = RIGHT DIGIT, WRONG PLACE":print
100 print "   YOU HAVE 10 GUESSES.":print
105 print "{158}   PRESS ANY KEY"
110 get k$:if k$="" then 110
120 print "{147}":for i=1 to 4:c(i)=int(rnd(1)*6)+1:next
130 t=0:print "{5}   TYPE FOUR DIGITS AND PRESS RETURN":print
140 t=t+1:if t>10 then 300
150 print "{159}";t;:input g$
160 if len(g$)<>4 then print "{28}   FOUR DIGITS PLEASE":t=t-1:goto 140
170 ok=1:for i=1 to 4:g(i)=val(mid$(g$,i,1)):if g(i)<1 or g(i)>6 then ok=0
180 next:if ok=0 then print "{28}   DIGITS 1 TO 6 ONLY":t=t-1:goto 140
190 b=0:w=0:for i=1 to 4:u(i)=0:v(i)=0:next
200 for i=1 to 4:if g(i)=c(i) then b=b+1:u(i)=1:v(i)=1
210 next
220 for i=1 to 4:if u(i)=1 then 250
230 for q=1 to 4:if v(q)=0 and g(i)=c(q) then w=w+1:v(q)=1:q=4
240 next
250 next
260 print "{5}   CLUE: {158}";
270 if b>0 then for i=1 to b:print "*";:next
275 if w>0 then for i=1 to w:print "+";:next
277 print:if b+w=0 then print "   (NOTHING MATCHES)"
280 if b=4 then 400
290 goto 140
300 print:print "{28}   OUT OF GUESSES! THE CODE WAS ";
310 for i=1 to 4:print chr$(48+c(i));:next:print:goto 450
400 poke 54296,15:poke 54277,9:poke 54276,17:poke 54273,40
410 print:print "{153}   CRACKED IT IN";t;"GUESSES!"
450 print:print "{5}   PLAY AGAIN? (Y/N)"
460 get k$:if k$="" then 460
470 if k$="Y" then 120
480 print "{147}":end
