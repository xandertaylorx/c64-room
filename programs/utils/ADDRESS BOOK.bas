10 rem *** address book (saves to disk) ***
20 poke 53280,6:poke 53281,6:dim n$(40),p$(40):nc=0:open 15,8,15
30 print "{147}{158}   A D D R E S S   B O O K":print
40 print "{5}   1 ADD A CONTACT"
50 print "   2 LIST CONTACTS"
60 print "   3 SEARCH"
70 print "   4 SAVE TO DISK (ADDRESSES)"
80 print "   5 LOAD FROM DISK"
90 print "   6 DISK STATUS"
100 print "   7 QUIT":print:print "{158}   CONTACTS:";nc
110 get k$:if k$<"1" or k$>"7" then 110
120 on val(k$) goto 200,300,400,500,600,700,800
200 print "{147}{5}":input "NAME";a$:if a$="" then 30
210 input "PHONE";b$:if nc>=40 then print "{28}BOOK IS FULL":goto 290
220 nc=nc+1:n$(nc)=a$:p$(nc)=b$:print "{153}ADDED."
290 for i=1 to 600:next:goto 30
300 print "{147}{5}":if nc=0 then print "NO CONTACTS YET.":goto 390
310 for i=1 to nc:print i;n$(i);" ";p$(i):next
390 print:print "{158}PRESS ANY KEY"
392 get k$:if k$="" then 392
395 goto 30
400 print "{147}{5}":input "SEARCH FOR";a$:f=0
410 if nc=0 then 390
420 for i=1 to nc:if left$(n$(i),len(a$))=a$ then print n$(i);" ";p$(i):f=1
430 next:if f=0 then print "{28}NOT FOUND."
440 goto 390
500 print "{147}{5}":if nc=0 then print "NOTHING TO SAVE.":goto 390
510 open 2,8,2,"@0:ADDRESSES,S,W":print#2,nc
520 for i=1 to nc:print#2,n$(i):print#2,p$(i):next
530 close 2:gosub 900:print "SAVED";nc;"CONTACTS."
540 goto 390
600 print "{147}{5}":open 2,8,2,"ADDRESSES,S,R"
610 gosub 900:if en<>0 then close 2:print "{28}COULD NOT READ THE FILE.":goto 390
620 input#2,nc:for i=1 to nc:input#2,n$(i):input#2,p$(i):next
630 close 2:print "{153}LOADED";nc;"CONTACTS.":goto 390
700 print "{147}{5}":gosub 900:print "DISK SAYS: ";en;em$:goto 390
800 close 15:print "{147}":end
900 input#15,en,em$,et,es:return
