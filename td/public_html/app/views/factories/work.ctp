<div id="fullcenter">

<p>Currently employed by 
<? 
if ($employer) echo $html->link($employer, '/miners/profile/'.$employer).' for '.$timeLeft;
else echo 'Nobody';
?>
</p>

<? echo $html->link($marketable['name'].' Market', '/marketables/market/'.$marketable['id']); ?>
<BR>
<?
if ($viewFactory)
	echo $factory->FactoryTable($viewFactory, false);
?>
<BR>
<? echo $html->link('Rent Factory', '/'.$factoryMarket['rrl']); ?>

</div>