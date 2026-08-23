<div id="fullcenter">

<?
if (!$canUse)
	echo '<p>Your profession does not use '.$itemsNeeded.'.</p>';
if (isset($vehicles) and count($vehicles))
{
	echo '<div id="VehiclesTable">';
	
	echo $this->element('vehicles');
	
	echo '</div>';
	
	
}
else
{
	echo "You do not have any $itemsNeeded yet.  You can purchase them from other players.<br>";
	echo "Browse the ".$html->link($mineType['name']." Mine", '/mine_types/browse/'.$mineType['id'])." to find one you'd like.";
}

?>


</div>
