<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
   "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html>
  <head>
    <meta http-equiv="content-type" content="text/html; charset=ISO-8859-1">
	<? 
	echo $html->css($stylesCSS);
	echo $html->css($profileCSS); 
	?>
  </head>
  <body style="padding: 0px;">

    <div class="meld_compare_wrapper">
      <div class="meld_compare">
  
        <div class="yourMelds">
          <h2><strong>Exclusively <? echo $otherName; ?>'s</strong> - <? echo count($theirMelds); ?> Melds</h2>
          <ul>
			<? $itemList->MeldList($theirMelds);	?>
          </ul>
        </div>
  
        <div class="myMelds">
          <h2><strong>Exclusively Yours</strong> - <? echo count($myMelds); ?> Melds</h2>
          <ul>
			<? $itemList->MeldList($myMelds);	?>
          </ul>
        </div>
        <div class="clear"></div>	
        
      </div>
    </div>
  </body>
</html>