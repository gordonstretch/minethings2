<div id="fullcenter">

<?

echo "<h3>Trashing ".$html->link($itemName, '/items/view/'.$itemId)."</h3>";
$isAre = $numberAvailable == 1 ? "is" : "are";
echo "You have ".$numberAvailable." in this city that $isAre trashable.  How many would you like to trash?";
echo $form->create(null, array('action' => 'trash/'.$itemId));
?><table><TR><TD><?
echo $form->input("Item.Count");
?></TD><TD><?
echo $form->input('Item.TrashOnFind', array('type' => 'checkbox', 'label' => ' Always trash upon finding'));
if ($damagedExists)
	echo $form->input('Item.TrashDamagedOnFind', array('type' => 'checkbox', 'label' => ' Always trash damaged item upon finding'));
?></TD></TR></TABLE><?
echo $form->end("Trash");
if (isset($message))
	echo $message;
?>

<? if ($activeDwarf): ?>
<p>A dwarf is in this city looking for some trash to collect.  He'll take the biggest pile in <? echo $cityName; ?> and leave some gifts in return.  So far, your pile has <? echo $trashCount;  echo (!$trashCount) ? 'nothing' : (($trashCount==1) ? ' thing':' things'); ?>.  The dwarf plans to pick a pile <? echo $time->timeago($auctionExpires); ?> but those plans may change.</p>
<? endif; ?>

</div>