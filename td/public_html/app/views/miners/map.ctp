<a href="mapalooza">
<? echo $html->image($imageName, array('ISMAP' => true, 'USEMAP' => '#mapareas', 'style' => 'border-style:none')); ?>
</a>

<map NAME="mapareas">
<?
if (count($mapCities) > 1) // no sense having a change city link if we only have 1 city
	foreach($mapCities as $city)
	{
		echo "\n".'<area SHAPE=RECT COORDS="'.$city['coords'].'"'
			.' HREF="'.$city['href'].'"'
			.' ALT="'.$city['name'].'"'
			.' OnClick="parent.Lightview.hide();parent.location.href=this.href; return false; "'
			.'/>';
	}
?>
<area SHAPE=DEFAULT >
</map>
