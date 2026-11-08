10 rem *** read me ***
20 poke 53280,14:poke 53281,6:p=1:q$=chr$(34)
30 print "{147}{154}"
40 on p goto 100,200,300,400
50 end
100 print " WELCOME TO YOUR COMMODORE 64":print
110 print "{5} TYPE BASIC LINES WITH A LINE NUMBER:":print
120 print "{158}  10 PRINT ";q$;"HELLO";q$
130 print "  20 GOTO 10":print "{5}"
140 print " THEN TYPE RUN. PRESS RUN/STOP (ESC)"
150 print " TO BREAK. TYPE LIST TO SEE IT.":print
160 print " NO LINE NUMBER = RUNS AT ONCE:"
170 print "{158}  PRINT 2+2":print "{5}"
180 print " FIX A LINE: CURSOR UP, EDIT, RETURN."
190 goto 500
200 print " DISKS (THE 1541, DEVICE 8)":print
210 print "{158}  LOAD";q$;"$";q$;",8":print "  LIST    {5}SHOW THE DIRECTORY"
220 print "{158}  LOAD";q$;"NAME";q$;",8":print "  RUN":print "{5}"
230 print " SAVE WHAT YOU TYPED:":print "{158}  SAVE";q$;"MYGAME";q$;",8":print "{5}"
240 print " USE THE 1541 PANEL FOR MORE DISKS,"
250 print " OR THE PROGRAM BUTTON TO COPY/PASTE."
260 goto 500
300 print " COLOURS AND SCREEN":print
310 print "{5} CTRL OR C= WITH 1-8 CHANGES COLOUR"
320 print " CTRL+9 REVERSE ON, CTRL+0 OFF":print
330 print "{158}  POKE 53280,0   {5}BORDER COLOUR"
340 print "{158}  POKE 53281,0   {5}BACKGROUND"
350 print "{158}  POKE 1024,1    {5}PUT AN 'A' TOP LEFT"
360 print "{158}  POKE 55296,2   {5}...AND MAKE IT RED":print "{5}"
370 print " PRESS SHIFT+C= TO SWAP CHARACTER SETS"
380 goto 500
400 print " SOUND AND SPRITES":print
410 print "{158}  POKE 54296,15":print "  POKE 54277,9"
420 print "  POKE 54273,40":print "  POKE 54276,17":print "{5}"
430 print " THAT PLAYS A NOTE. POKE 54276,16"
440 print " STOPS IT. TRY THE PIANO PROGRAM!":print
450 print " SPRITES: SEE THE SPRITE EDITOR AND"
460 print " THE SPRITE DEMO ON THE DEMO DISK."
500 print:print "{159} ";p;"OF 4  - ANY KEY=NEXT  Q=QUIT"
510 get k$:if k$="" then 510
520 if k$="Q" then poke 53280,14:poke 53281,6:print "{147}{154}":end
530 p=p+1:if p>4 then p=1
540 goto 30
