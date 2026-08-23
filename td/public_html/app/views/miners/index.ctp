<div id="halfcenter"> <!-- Start Half Center -->

<?
if (strlen($globalMessage) > 0)
	{
	echo "<BR><B>".$globalMessage."</B>";
	if ($isAdministrator)
		echo "<BR>".$html->link('edit', '/admins/update_global_message');
	echo "<BR>";
	}
?>

<?
if ($canMoveHere)
	{
	echo "<div><BR>Enjoy the benefits of living in $currentCityName including a local mining bonus and cheaper prices of local goods.<br>"
	.$html->link('Move to '.$currentCityName, '/miners/move')."<br></div>";
	}
?>

<?
foreach($ads as $a)
	{
	echo "<BR>";	
	echo $html->link($a['text'], '/'.$a['rrl'])."<BR>";
	echo $a['minerName']." ".$a['date']."<BR>";
	}
?>

<?
foreach($news as $n)
{
	echo '<div style="border:solid; border-width:1px; padding:5px; margin-top:12px; overflow:hidden;">';
	echo '<div style="margin-top:5px; margin-left:5px; font-size:12px; float:right">'.$time->timeago($n['time']).'</div>';
	echo $n['news'];
	echo '</div>';
}
?>

<? if($showWelcome): ?>
<h2 id="welcome">Welcome to MineThings</h2>
<p>It's the year 4024. The first humans are back on Earth, having lived on Mars for 2000 years.  They escaped the most catastrophic volcano eruption in recorded history: Yellowstone. </p>
<p>Everything is now covered in the thick, silty soil that the eruption left behind. Almost immediately upon arrival, people start to dig.</p>
<p> You are one of these survivors and have been given your own plot of land to mine. You will mine this land night and day, uncovering what ancient civilization has left behind. </p>
<p>Combine your findings for meld points or bring them to the market where you can list your things for sale, bid on new treasure, and purchase more land with new opportunity. </p>
<? if ($showHowThisWorks): ?>
	<p>For more information, see <? echo $html->link('How This Works', '/miners/how_this_works'); ?>. </p>
<? endif; ?>
<? endif; ?>
<p>&nbsp;</p>
</div> <!-- End Half Center -->
            
<div id="right" > <!--Right Column Tables-->

<h2 id="discoveries">Discoveries</h2>

<table class="table" summary="Discoveries">
    
 <!--Discoveries Table Body & Rows-->
	<tbody>
	<?
	$cells = array();
	foreach($discoveries as $discovery)
	{
		$date = preg_replace('/\d+-(\d+-\d+).*/', '$1', $discovery['discovery_date']);

		$cells[] = array( 
			array (
				$html->link($discovery['item_name'], '/items/view/'.$discovery['item_id'], array( 
					'class' => $itemList->GetRarityClass($discovery['rarity']),
					'style' => 'background-image:url('.$html->base.$discovery['icon'].');',
					)), 
				array('class' => 'item'),
			),
			array(
				$html->link($discovery['discoverer_name'], '/miners/profile/'.$discovery['discoverer_name']),
				array('class' => 'name'),
			),
			array(
				$date,
				array('class' => 'date'),
			),
			);
	}
	echo $html->tableCells( $cells, array('class' => 'even'), array('class' => 'odd'));
	?>
	
        
       </tbody>
    </table>

    <h2 id="listings">Listings</h2>


    <table class="table" summary="Listings">
    
    <!--Listings Table Body & Rows-->
	<tbody>

	<?
	$cells = array();
	foreach($listings as $listing)
	{
		$cells[] = array( 
			array (
				$html->link($listing['name'], '/'.$listing['marketRRL'], array( 
					'class' => $itemList->GetRarityClass($listing['rarity']),
					'style' => 'background-image:url('.$html->base.$listing['icon'].');',
					)), 
				array('class' => 'item'),
			),
			array(
				$market->priceQuantity($listing['price'], $listing['quantity']),
				array('class' => 'price'),
			),			
			);
	}
	echo $html->tableCells( $cells, array('class' => 'even'), array('class' => 'odd') );
	?>

        </tbody>
    </table>
   
   <h2 id="bids">Bids</h2>

    <table class="table" summary="Bids">
    
    <!--Bids Table Body & Rows-->
	<tbody>
	
	<!--
	<tr>
		<td class="item"><a class="blue" href="#">Hardy Cart</a></td>
        <td class="weight"><a href="#">700g</a></td>
	</tr>	
	-->

	<?
	$cells = array();
	foreach($bids as $bid)
	{
		$cells[] = array( 
			array (
				$html->link($bid['name'], '/'.$bid['marketRRL'], array( 
					'class' => $itemList->GetRarityClass($bid['rarity']),
					'style' => 'background-image:url('.$html->base.$bid['icon'].');',
					)), 
				array('class' => 'item'),
			),
			array(
				$market->priceQuantity($bid['price'], $bid['quantity']),
				array('class' => 'price'),
			),			
			);
	}
	echo $html->tableCells( $cells, array('class' => 'even'), array('class' => 'odd') );
	?>

 	</tbody>
	</table>

	<? if (!$hasMarket): ?>
	<BR>&nbsp;&nbsp;No Market in <? echo $currentCityName; ?>.
	<? endif ?>

    
</div>
<!--End Right Discoveries Column-->            


<? if ($signup): ?>

<!-- Google Code for Signup Conversion Page -->
<script type="text/javascript">
/* <![CDATA[ */
var google_conversion_id = 1032221859;
var google_conversion_language = "en";
var google_conversion_format = "3";
var google_conversion_color = "5e5a57";
var google_conversion_label = "XgdyCMXnpwEQo-mZ7AM";
var google_remarketing_only = false;
/* ]]> */
</script>
<script type="text/javascript" src="//www.googleadservices.com/pagead/conversion.js">
</script>
<noscript>
<div style="display:inline;">
<img height="1" width="1" style="border-style:none;" alt="" src="//www.googleadservices.com/pagead/conversion/1032221859/?label=XgdyCMXnpwEQo-mZ7AM&amp;guid=ON&amp;script=0"/>
</div>
</noscript>


<? endif; ?>
